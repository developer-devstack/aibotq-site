import { ApiError, decrypt, encrypt } from './lib';
import type { Env, Provider, RepoInfo } from './types';

interface ProviderCfg {
  label: string;
  authorize: string;
  token: string;
  scope: string;
  idVar: 'GITHUB_CLIENT_ID' | 'GITLAB_CLIENT_ID' | 'BITBUCKET_CLIENT_ID';
  secretVar: 'GITHUB_CLIENT_SECRET' | 'GITLAB_CLIENT_SECRET' | 'BITBUCKET_CLIENT_SECRET';
  api: string;
  column: 'github_id' | 'gitlab_id' | 'bitbucket_id';
  host: string;
}

export const CFG: Record<Provider, ProviderCfg> = {
  github: {
    label: 'GitHub',
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user repo',
    idVar: 'GITHUB_CLIENT_ID',
    secretVar: 'GITHUB_CLIENT_SECRET',
    api: 'https://api.github.com',
    column: 'github_id',
    host: 'github.com',
  },
  gitlab: {
    label: 'GitLab',
    authorize: 'https://gitlab.com/oauth/authorize',
    token: 'https://gitlab.com/oauth/token',
    scope: 'read_user read_api read_repository',
    idVar: 'GITLAB_CLIENT_ID',
    secretVar: 'GITLAB_CLIENT_SECRET',
    api: 'https://gitlab.com/api/v4',
    column: 'gitlab_id',
    host: 'gitlab.com',
  },
  bitbucket: {
    label: 'Bitbucket',
    authorize: 'https://bitbucket.org/site/oauth2/authorize',
    token: 'https://bitbucket.org/site/oauth2/access_token',
    scope: '', // Bitbucket scopes are configured on the OAuth consumer itself
    idVar: 'BITBUCKET_CLIENT_ID',
    secretVar: 'BITBUCKET_CLIENT_SECRET',
    api: 'https://api.bitbucket.org/2.0',
    column: 'bitbucket_id',
    host: 'bitbucket.org',
  },
};

export function isConfigured(env: Env, p: Provider): boolean {
  return !!env[CFG[p].idVar] && !!env[CFG[p].secretVar];
}

export function assertConfigured(env: Env, p: Provider): void {
  if (!isConfigured(env, p)) throw new ApiError(501, `${CFG[p].label} is not configured yet`, 'provider_not_configured');
}

// ---------- OAuth ----------
export function authorizeUrl(env: Env, p: Provider, redirectUri: string, state: string, allowSignup: boolean): string {
  const c = CFG[p];
  const u = new URL(c.authorize);
  u.searchParams.set('client_id', env[c.idVar] as string);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  if (p === 'github') u.searchParams.set('allow_signup', String(allowSignup));
  if (c.scope) u.searchParams.set('scope', c.scope);
  if (p !== 'github') u.searchParams.set('response_type', 'code');
  return u.toString();
}

export interface TokenSet {
  access: string;
  refresh?: string;
  expires_at?: number;
  scope?: string;
}

async function tokenRequest(env: Env, p: Provider, params: Record<string, string>): Promise<TokenSet> {
  const c = CFG[p];
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'aibotq-dev' };
  const body = new URLSearchParams(params);
  if (p === 'bitbucket') headers.authorization = 'Basic ' + btoa(`${env[c.idVar]}:${env[c.secretVar]}`);
  else {
    body.set('client_id', env[c.idVar] as string);
    body.set('client_secret', env[c.secretVar] as string);
  }
  let res: Response;
  try {
    res = await fetch(c.token, { method: 'POST', headers, body });
  } catch {
    throw new ApiError(502, `Could not reach ${c.label} to complete sign-in`);
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || j.error || !j.access_token) {
    throw new ApiError(502, `${c.label} sign-in failed: ${String(j.error_description || j.error || res.status).slice(0, 200)}`);
  }
  return {
    access: j.access_token,
    refresh: j.refresh_token,
    expires_at: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : undefined,
    scope: j.scope,
  };
}

export const exchangeCode = (env: Env, p: Provider, code: string, redirectUri: string) =>
  tokenRequest(env, p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });

export async function saveToken(env: Env, userId: string, p: Provider, t: TokenSet): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO provider_tokens (user_id, provider, token_enc, scope, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, provider) DO UPDATE SET token_enc = excluded.token_enc, scope = excluded.scope, updated_at = excluded.updated_at',
  )
    .bind(userId, p, await encrypt(env, JSON.stringify(t)), t.scope ?? null, Date.now())
    .run();
}

export async function getToken(env: Env, userId: string, p: Provider): Promise<string | null> {
  const row = await env.DB.prepare('SELECT token_enc FROM provider_tokens WHERE user_id = ? AND provider = ?').bind(userId, p).first<{ token_enc: string }>();
  if (!row) return null;
  let t = JSON.parse(await decrypt(env, row.token_enc)) as TokenSet;
  if (t.expires_at && t.expires_at < Date.now() + 60_000) {
    if (!t.refresh) throw new ApiError(401, `Your ${CFG[p].label} session expired — sign in with ${CFG[p].label} again`, 'reauth');
    t = { ...(await tokenRequest(env, p, { grant_type: 'refresh_token', refresh_token: t.refresh })), scope: t.scope };
    await saveToken(env, userId, p, t);
  }
  return t.access;
}

export async function requireToken(env: Env, userId: string, p: Provider): Promise<string> {
  const t = await getToken(env, userId, p);
  if (!t) throw new ApiError(403, `${CFG[p].label} is not connected — continue with ${CFG[p].label} first`, 'not_connected');
  return t;
}

// ---------- API calls ----------
export async function api(p: Provider, token: string | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { 'user-agent': 'aibotq-dev', accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (p === 'github') {
    headers['x-github-api-version'] = '2022-11-28';
    if (headers.accept === 'application/json') headers.accept = 'application/vnd.github+json';
  }
  try {
    return await fetch(path.startsWith('http') ? path : CFG[p].api + path, { ...init, headers });
  } catch {
    throw new ApiError(502, `Could not reach ${CFG[p].label}`);
  }
}

export async function apiJson<T = any>(p: Provider, token: string | null, path: string, init: RequestInit = {}): Promise<{ data: T; res: Response }> {
  const res = await api(p, token, path, init);
  if (!res.ok) throw await providerError(p, res);
  return { data: (await res.json()) as T, res };
}

export async function providerError(p: Provider, res: Response): Promise<ApiError> {
  const label = CFG[p].label;
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  const msg = String(body.message || body.error?.message || body.error || '').slice(0, 200);
  if (res.status === 401) return new ApiError(401, `${label} rejected the stored token — sign in with ${label} again`, 'reauth');
  if (res.status === 404) return new ApiError(404, `Not found on ${label} (or your token cannot see it)${msg ? `: ${msg}` : ''}`, 'not_found');
  if (res.status === 403 || res.status === 429) {
    const limited = res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429;
    return new ApiError(limited ? 429 : 403, limited ? `${label} API rate limit reached — try again later` : `${label} denied access${msg ? `: ${msg}` : ''}`);
  }
  if (res.status === 422) return new ApiError(422, `${label}: ${msg || 'request rejected'}`, 'unprocessable');
  return new ApiError(502, `${label} API error (${res.status})${msg ? `: ${msg}` : ''}`);
}

export interface ProviderUser {
  id: string;
  login: string;
  name: string | null;
  avatar: string | null;
}

export async function fetchUser(p: Provider, token: string): Promise<ProviderUser> {
  if (p === 'github') {
    const { data } = await apiJson(p, token, '/user');
    return { id: String(data.id), login: data.login, name: data.name ?? null, avatar: data.avatar_url ?? null };
  }
  if (p === 'gitlab') {
    const { data } = await apiJson(p, token, '/user');
    return { id: String(data.id), login: data.username, name: data.name ?? null, avatar: data.avatar_url ?? null };
  }
  const { data } = await apiJson(p, token, '/user');
  return {
    id: String(data.uuid),
    login: data.nickname || data.username || data.display_name,
    name: data.display_name ?? null,
    avatar: data.links?.avatar?.href ?? null,
  };
}

// ---------- repos ----------
function mapRepo(p: Provider, r: any): RepoInfo {
  if (p === 'github') {
    return { provider: p, full_name: r.full_name, name: r.name, private: !!r.private, default_branch: r.default_branch || 'main', description: r.description ?? null, updated_at: r.pushed_at ?? r.updated_at ?? null, language: r.language ?? null, html_url: r.html_url };
  }
  if (p === 'gitlab') {
    return { provider: p, full_name: r.path_with_namespace, name: r.path, private: r.visibility !== 'public', default_branch: r.default_branch || 'main', description: r.description ?? null, updated_at: r.last_activity_at ?? null, language: null, html_url: r.web_url };
  }
  return { provider: p, full_name: r.full_name, name: r.slug || r.name, private: !!r.is_private, default_branch: r.mainbranch?.name || 'main', description: r.description || null, updated_at: r.updated_on ?? null, language: r.language || null, html_url: r.links?.html?.href };
}

const GH_SCAN_PAGES = 5;

export async function listRepos(p: Provider, token: string, q: string, page: number) {
  const PER = 30;
  if (p === 'github') {
    const base = '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member';
    if (!q) {
      const { data } = await apiJson<any[]>(p, token, `${base.replace('per_page=100', 'per_page=' + PER)}&page=${page}`);
      return { repos: data.map((r) => mapRepo(p, r)), page, has_more: data.length === PER, truncated: false };
    }
    // GitHub has no "search my repos by name incl. org/private" endpoint, so scan up to 500 and filter.
    const needle = q.toLowerCase();
    const all: RepoInfo[] = [];
    let truncated = false;
    for (let i = 1; i <= GH_SCAN_PAGES; i++) {
      const { data } = await apiJson<any[]>(p, token, `${base}&page=${i}`);
      all.push(...data.map((r) => mapRepo(p, r)));
      if (data.length < 100) break;
      if (i === GH_SCAN_PAGES) truncated = true;
    }
    return { repos: all.filter((r) => r.full_name.toLowerCase().includes(needle)).slice(0, 50), page: 1, has_more: false, truncated };
  }
  if (p === 'gitlab') {
    const { data } = await apiJson<any[]>(p, token, `/projects?membership=true&per_page=${PER}&page=${page}&order_by=last_activity_at${q ? '&search=' + encodeURIComponent(q) : ''}`);
    return { repos: data.map((r) => mapRepo(p, r)), page, has_more: data.length === PER, truncated: false };
  }
  const filter = q ? `&q=${encodeURIComponent(`name ~ "${q.replace(/["\\]/g, '')}"`)}` : '';
  const { data } = await apiJson<any>(p, token, `/repositories?role=member&pagelen=${PER}&page=${page}&sort=-updated_on${filter}`);
  return { repos: (data.values as any[]).map((r) => mapRepo(p, r)), page, has_more: !!data.next, truncated: false };
}

export async function getRepo(p: Provider, token: string | null, fullName: string): Promise<RepoInfo> {
  if (p === 'github') return mapRepo(p, (await apiJson(p, token, `/repos/${fullName}`)).data);
  if (p === 'gitlab') return mapRepo(p, (await apiJson(p, token, `/projects/${encodeURIComponent(fullName)}`)).data);
  return mapRepo(p, (await apiJson(p, token, `/repositories/${fullName}`)).data);
}

export function parseRepoUrl(input: string): { provider: Provider; full_name: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new ApiError(400, 'Enter a valid repository URL, e.g. https://github.com/user/repo');
  }
  const provider = (Object.keys(CFG) as Provider[]).find((p) => u.hostname === CFG[p].host || u.hostname === 'www.' + CFG[p].host);
  if (u.protocol !== 'https:' || !provider || u.username || u.password) {
    throw new ApiError(400, 'Only https:// URLs on github.com, gitlab.com or bitbucket.org are supported');
  }
  let parts = u.pathname.split('/').filter(Boolean);
  if (provider === 'gitlab') {
    const dash = parts.indexOf('-');
    if (dash >= 0) parts = parts.slice(0, dash);
  } else parts = parts.slice(0, 2);
  if (parts.length < 2 || !parts.every((s) => /^[\w.-]+$/.test(s) && s !== '.' && s !== '..')) {
    throw new ApiError(400, 'URL must point to a repository: https://<host>/<owner>/<repo>');
  }
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.git$/, '');
  return { provider, full_name: parts.join('/') };
}

export function cloneUrl(p: Provider, fullName: string): string {
  return `https://${CFG[p].host}/${fullName}.git`;
}

// ---------- file read + framework detection ----------
export async function readRepoFile(p: Provider, token: string | null, fullName: string, branch: string, path: string): Promise<string | null> {
  let res: Response;
  if (p === 'github') {
    const encPath = path.split('/').map(encodeURIComponent).join('/');
    res = await api(p, token, `/repos/${fullName}/contents/${encPath}?ref=${encodeURIComponent(branch)}`, { headers: { accept: 'application/vnd.github.raw+json' } });
  } else if (p === 'gitlab') {
    res = await api(p, token, `/projects/${encodeURIComponent(fullName)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(branch)}`);
  } else {
    res = await api(p, token, `/repositories/${fullName}/src/${encodeURIComponent(branch)}/${path}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw await providerError(p, res);
  return await res.text();
}

export interface Detected {
  framework: string;
  build_command: string;
  output_dir: string;
}

export const FRAMEWORKS = ['nextjs', 'nuxt', 'astro', 'sveltekit', 'remix', 'vite', 'cra', 'node', 'static', 'other'] as const;

export function detectFramework(pkg: any | null): Detected {
  if (!pkg) return { framework: 'static', build_command: '', output_dir: '.' };
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } as Record<string, string>;
  const has = (n: string) => n in deps;
  const hasBuild = !!pkg.scripts?.build;
  const build = hasBuild ? 'npm run build' : '';
  if (has('next')) return { framework: 'nextjs', build_command: build || 'npx next build', output_dir: '.next' };
  if (has('nuxt')) return { framework: 'nuxt', build_command: build || 'npx nuxt build', output_dir: '.output' };
  if (has('astro')) return { framework: 'astro', build_command: build || 'npx astro build', output_dir: 'dist' };
  if (has('@sveltejs/kit')) return { framework: 'sveltekit', build_command: build || 'npx vite build', output_dir: '.svelte-kit' };
  if (has('@remix-run/react') || has('@remix-run/node')) return { framework: 'remix', build_command: build || 'npx remix build', output_dir: 'build' };
  if (has('vite')) return { framework: 'vite', build_command: build || 'npx vite build', output_dir: 'dist' };
  if (has('react-scripts')) return { framework: 'cra', build_command: build || 'npx react-scripts build', output_dir: 'build' };
  if (has('hono') || has('wrangler') || has('express') || has('fastify') || pkg.scripts?.start) return { framework: 'node', build_command: build, output_dir: '.' };
  return { framework: 'other', build_command: build, output_dir: hasBuild ? 'dist' : '.' };
}
