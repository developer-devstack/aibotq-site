import { ApiError, appOrigin, clientIp, cookie, ok, parseCookies, randomToken, rateLimit, sha256Hex, sign, timingSafeEqual, unsign } from './lib';
import { CFG, assertConfigured, authorizeUrl, exchangeCode, fetchUser, isConfigured, saveToken } from './providers';
import { PROVIDERS, type Ctx, type Env, type Provider, type User } from './types';

const SESSION_COOKIE = 'aq_session';
const STATE_COOKIE = 'aq_oauth';
const SESSION_TTL = 30 * 24 * 3600;
const STATE_TTL = 600;
const NEXT_ALLOWED = ['/new/?step=1', '/dashboard/'];

export async function getSessionUser(req: Request, env: Env): Promise<{ user: User; sessionId: string } | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const sessionId = await sha256Hex(token);
  const user = await env.DB.prepare(
    'SELECT u.id, u.login, u.name, u.avatar, u.github_id, u.gitlab_id, u.bitbucket_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?',
  )
    .bind(sessionId, Date.now())
    .first<User>();
  return user ? { user, sessionId } : null;
}

export async function requireUser({ req, env }: Ctx): Promise<User> {
  const s = await getSessionUser(req, env);
  if (!s) throw new ApiError(401, 'Sign in required', 'unauthenticated');
  return s.user;
}

function parseProvider(v: string): Provider {
  if (!(PROVIDERS as string[]).includes(v)) throw new ApiError(404, 'Unknown provider');
  return v as Provider;
}

export async function authStart(c: Ctx, providerName: string): Promise<Response> {
  const p = parseProvider(providerName);
  await rateLimit(c.env, `auth:${clientIp(c.req)}`, 20, 600);
  assertConfigured(c.env, p);
  const mode = c.url.searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const state = randomToken(24);
  const redirectUri = `${appOrigin(c.env, c.url)}/api/auth/${p}/callback`;
  const nextParam = c.url.searchParams.get('next') || '';
  const next = NEXT_ALLOWED.includes(nextParam) ? nextParam : '/new/?step=1';
  const stateCookie = await sign(c.env, { state, p, mode, next, exp: Date.now() + STATE_TTL * 1000 });
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl(c.env, p, redirectUri, state, mode === 'signup'),
      'set-cookie': cookie(c.url, STATE_COOKIE, stateCookie, STATE_TTL),
      'cache-control': 'no-store',
    },
  });
}

function redirectWithError(c: Ctx, message: string, clearState = true): Response {
  const headers = new Headers({ location: `/new/?auth_error=${encodeURIComponent(message.slice(0, 200))}`, 'cache-control': 'no-store' });
  if (clearState) headers.append('set-cookie', cookie(c.url, STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export async function authCallback(c: Ctx, providerName: string): Promise<Response> {
  const p = parseProvider(providerName);
  await rateLimit(c.env, `auth-cb:${clientIp(c.req)}`, 30, 600);
  assertConfigured(c.env, p);

  const q = c.url.searchParams;
  if (q.get('error')) return redirectWithError(c, `${CFG[p].label} sign-in was cancelled or denied: ${q.get('error_description') || q.get('error')}`);

  const saved = await unsign<{ state: string; p: Provider; mode: string; next?: string; exp: number }>(c.env, parseCookies(c.req)[STATE_COOKIE]);
  const state = q.get('state') || '';
  if (!saved || saved.p !== p || saved.exp < Date.now() || !timingSafeEqual(saved.state, state)) {
    return redirectWithError(c, 'Sign-in session expired or was tampered with — please try again');
  }
  const code = q.get('code');
  if (!code) return redirectWithError(c, `${CFG[p].label} did not return an authorization code`);

  try {
    const redirectUri = `${appOrigin(c.env, c.url)}/api/auth/${p}/callback`;
    const tokens = await exchangeCode(c.env, p, code, redirectUri);
    const pu = await fetchUser(p, tokens.access);
    const col = CFG[p].column;
    const existingSession = await getSessionUser(c.req, c.env);

    const found = await c.env.DB.prepare(`SELECT id FROM users WHERE ${col} = ?`).bind(pu.id).first<{ id: string }>();
    let userId: string;
    if (found) {
      if (existingSession && existingSession.user.id !== found.id) {
        return redirectWithError(c, `This ${CFG[p].label} account is already linked to a different Aibotq account`);
      }
      userId = found.id;
      await c.env.DB.prepare('UPDATE users SET login = ?, name = ?, avatar = ? WHERE id = ?').bind(pu.login, pu.name, pu.avatar, userId).run();
    } else if (existingSession) {
      // Signed in with another provider: link this identity to the current account.
      userId = existingSession.user.id;
      await c.env.DB.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).bind(pu.id, userId).run();
    } else {
      userId = crypto.randomUUID();
      await c.env.DB.prepare(`INSERT INTO users (id, ${col}, login, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(userId, pu.id, pu.login, pu.name, pu.avatar, Date.now())
        .run();
    }
    await saveToken(c.env, userId, p, tokens);

    if (existingSession) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(existingSession.sessionId).run();
    const sessionToken = randomToken(32);
    await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(sessionToken), userId, Date.now() + SESSION_TTL * 1000)
      .run();

    const headers = new Headers({ location: saved.next && NEXT_ALLOWED.includes(saved.next) ? saved.next : '/new/?step=1', 'cache-control': 'no-store' });
    headers.append('set-cookie', cookie(c.url, SESSION_COOKIE, sessionToken, SESSION_TTL));
    headers.append('set-cookie', cookie(c.url, STATE_COOKIE, '', 0));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    if (e instanceof ApiError) return redirectWithError(c, e.message);
    throw e;
  }
}

export async function me(c: Ctx): Promise<Response> {
  const s = await getSessionUser(c.req, c.env);
  if (!s) return ok({ user: null });
  const { user } = s;
  const connected: Record<string, boolean> = {};
  for (const p of PROVIDERS) connected[p] = !!user[CFG[p].column];
  return ok({ user: { id: user.id, login: user.login, name: user.name, avatar: user.avatar, connected } });
}

export async function logout(c: Ctx): Promise<Response> {
  const s = await getSessionUser(c.req, c.env);
  if (s) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(s.sessionId).run();
  return ok({ signed_out: true }, 200, { 'set-cookie': cookie(c.url, SESSION_COOKIE, '', 0) });
}

export function config(c: Ctx): Response {
  const providers: Record<string, { configured: boolean }> = {};
  for (const p of PROVIDERS) providers[p] = { configured: isConfigured(c.env, p) };
  return ok({
    providers,
    uploads: !!c.env.UPLOADS,
    deploy: !!(c.env.DEPLOY_WEBHOOK_URL && c.env.DEPLOY_WEBHOOK_SECRET),
  });
}
