import { requireUser } from './auth';
import { ApiError, appOrigin, clientIp, decrypt, encrypt, hmacHex, ok, rateLimit, readJson, requireSecret, timingSafeEqual } from './lib';
import { CFG, FRAMEWORKS, api, cloneUrl, getRepo, getToken } from './providers';
import { signedManifestUrl } from './repos';
import { PROVIDERS, type Ctx, type Env, type Provider } from './types';

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  repo_full_name: string | null;
  source: string;
  provider: Provider | null;
  repo_private: number;
  branch: string | null;
  upload_id: string | null;
  framework: string | null;
  build_command: string | null;
  output_dir: string | null;
  root_dir: string | null;
  env_enc: string | null;
  webhook_id: string | null;
  webhook_status: string | null;
  status: string;
  url: string | null;
  created_at: number;
}

interface DeploymentRow {
  id: string;
  project_id: string;
  step: string;
  status: 'queued' | 'building' | 'ready' | 'failed';
  log: string;
  commit_sha: string | null;
  url: string | null;
  environment: 'production' | 'preview';
  ref: string | null;
  created_at: number;
}

const MAX_LOG = 64 * 1024;
const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

async function projectPublic(env: Env, p: ProjectRow) {
  let env_keys: string[] = [];
  if (p.env_enc) env_keys = Object.keys(JSON.parse(await decrypt(env, p.env_enc)));
  return {
    id: p.id, name: p.name, repo_full_name: p.repo_full_name, source: p.source, provider: p.provider, private: !!p.repo_private,
    branch: p.branch, upload_id: p.upload_id, framework: p.framework, build_command: p.build_command, output_dir: p.output_dir,
    root_dir: p.root_dir, env_keys, webhook_status: p.webhook_status, status: p.status, url: p.url, created_at: p.created_at,
  };
}

function deploymentPublic(d: DeploymentRow) {
  return { id: d.id, project_id: d.project_id, step: d.step, status: d.status, log: d.log, commit_sha: d.commit_sha, url: d.url, environment: d.environment, ref: d.ref, created_at: d.created_at };
}

function str(v: unknown, field: string, max: number, re?: RegExp, msg?: string): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ApiError(400, `${field} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new ApiError(400, `${field} is too long (max ${max} characters)`);
  if (re && s && !re.test(s)) throw new ApiError(400, msg || `${field} is invalid`);
  return s;
}

function relDir(v: unknown, field: string): string {
  const s = str(v, field, 200, /^[\w./@-]*$/, `${field} may only contain letters, numbers, ".", "/", "-", "_" and "@"`).replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '');
  if (s.split('/').includes('..')) throw new ApiError(400, `${field} cannot contain ".."`);
  return s;
}

// ---------- webhook registration ----------
async function registerGithubWebhook(c: Ctx, token: string, fullName: string): Promise<{ id: string | null; status: string }> {
  if (!c.env.GITHUB_WEBHOOK_SECRET) return { id: null, status: 'unavailable: GITHUB_WEBHOOK_SECRET is not configured' };
  const origin = appOrigin(c.env, c.url);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin)) return { id: null, status: 'skipped: APP_URL is not publicly reachable (local dev)' };
  const res = await api('github', token, `/repos/${fullName}/hooks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['push', 'pull_request'],
      config: { url: `${origin}/api/webhooks/github`, content_type: 'json', secret: c.env.GITHUB_WEBHOOK_SECRET, insecure_ssl: '0' },
    }),
  });
  if (res.status === 201) return { id: String(((await res.json()) as any).id), status: 'active' };
  const body = (await res.json().catch(() => ({}))) as any;
  const msg = JSON.stringify(body.errors || body.message || '');
  if (res.status === 422 && /already exists/i.test(msg)) return { id: null, status: 'active' };
  if (res.status === 404 || res.status === 403) return { id: null, status: 'unavailable: admin access to the repository is required to register a webhook' };
  return { id: null, status: `failed: GitHub returned ${res.status}` };
}

// ---------- create project ----------
export async function projectCreate(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const b = await readJson<Record<string, unknown>>(c.req, 256 * 1024);

  const name = str(b.name, 'Project name', 40, /^[a-z0-9][a-z0-9-]{1,39}$/, 'Project name must be 2–40 characters: lowercase letters, numbers and hyphens, starting with a letter or number');
  if (!name) throw new ApiError(400, 'Project name is required');
  const source = b.source;
  if (source !== 'import' && source !== 'template' && source !== 'url' && source !== 'upload') throw new ApiError(400, 'Unknown project source');

  const framework = str(b.framework, 'Framework', 20) || 'other';
  if (!(FRAMEWORKS as readonly string[]).includes(framework)) throw new ApiError(400, 'Unknown framework');
  const build_command = str(b.build_command, 'Build command', 500);
  if (/[\r\n]/.test(build_command)) throw new ApiError(400, 'Build command must be a single line');
  const output_dir = relDir(b.output_dir, 'Output directory');
  const root_dir = relDir(b.root_dir, 'Root directory');

  const envVars: Record<string, string> = {};
  if (b.env !== undefined) {
    if (!b.env || typeof b.env !== 'object' || Array.isArray(b.env)) throw new ApiError(400, 'env must be an object of KEY: value');
    const entries = Object.entries(b.env as Record<string, unknown>);
    if (entries.length > 64) throw new ApiError(400, 'Too many environment variables (max 64)');
    for (const [k, v] of entries) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw new ApiError(400, `Invalid environment variable name: ${k.slice(0, 40)}`);
      if (typeof v !== 'string' || v.length > 4096) throw new ApiError(400, `Value for ${k} must be a string up to 4096 characters`);
      envVars[k] = v;
    }
  }

  let provider: Provider | null = null;
  let repo_full_name: string | null = null;
  let repo_private = 0;
  let branch: string | null = null;
  let upload_id: string | null = null;
  let token: string | null = null;

  if (source === 'upload') {
    upload_id = str(b.upload_id, 'upload_id', 64);
    const up = await c.env.DB.prepare('SELECT id FROM uploads WHERE id = ? AND user_id = ?').bind(upload_id, user.id).first();
    if (!up) throw new ApiError(404, 'Upload not found');
  } else {
    provider = b.provider as Provider;
    if (!PROVIDERS.includes(provider)) throw new ApiError(400, 'Unknown provider');
    repo_full_name = str(b.repo_full_name, 'Repository', 200, /^[\w.-]+(\/[\w.-]+)+$/, 'Invalid repository name');
    token = await getToken(c.env, user.id, provider);
    // Never trust client-supplied repo metadata: re-check with the user's own token.
    const repo = await getRepo(provider, token, repo_full_name);
    repo_full_name = repo.full_name;
    repo_private = repo.private ? 1 : 0;
    branch = repo.default_branch;
  }

  const id = crypto.randomUUID();
  const env_enc = Object.keys(envVars).length ? await encrypt(c.env, JSON.stringify(envVars)) : null;

  let webhook: { id: string | null; status: string } = { id: null, status: provider === 'github' ? 'pending' : 'unavailable: auto-deploy webhooks are only supported for GitHub' };
  if (provider === 'github' && token && repo_full_name) webhook = await registerGithubWebhook(c, token, repo_full_name);
  if (source === 'upload') webhook = { id: null, status: 'unavailable: uploads have no git remote' };

  await c.env.DB.prepare(
    `INSERT INTO projects (id, user_id, name, repo_full_name, source, provider, repo_private, branch, upload_id, framework, build_command, output_dir, root_dir, env_enc, webhook_id, webhook_status, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?)`,
  )
    .bind(id, user.id, name, repo_full_name, source, provider, repo_private, branch, upload_id, framework, build_command, output_dir, root_dir, env_enc, webhook.id, webhook.status, Date.now())
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();
  return ok({ project: await projectPublic(c.env, row!) }, 201);
}

async function ownedProject(c: Ctx, id: string): Promise<ProjectRow> {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first<ProjectRow>();
  if (!row) throw new ApiError(404, 'Project not found');
  return row;
}

export async function projectGet(c: Ctx, id: string): Promise<Response> {
  const p = await ownedProject(c, id);
  if (p.source !== 'upload' && p.provider === 'github' && c.env.GITHUB_WEBHOOK_SECRET && /GITHUB_WEBHOOK_SECRET is not configured/.test(p.webhook_status || '')) {
    // Projects created before the webhook secret existed: register the push/PR webhook now.
    const t = await getToken(c.env, p.user_id, 'github');
    if (t) {
      const w = await registerGithubWebhook(c, t, p.repo_full_name!);
      await c.env.DB.prepare('UPDATE projects SET webhook_id = ?, webhook_status = ? WHERE id = ?').bind(w.id, w.status, p.id).run();
      p.webhook_id = w.id; p.webhook_status = w.status;
    }
  }
  const d = await c.env.DB.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').bind(id).first<DeploymentRow>();
  return ok({ project: await projectPublic(c.env, p), latest_deployment: d ? deploymentPublic(await expireIfStuck(c.env, d)) : null });
}

export async function projectList(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, d.id AS d_id, d.status AS d_status, d.step AS d_step, d.url AS d_url, d.environment AS d_env, d.created_at AS d_created
     FROM projects p LEFT JOIN deployments d ON d.id = (SELECT id FROM deployments WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1)
     WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all<ProjectRow & { d_id: string | null; d_status: string | null; d_step: string | null; d_url: string | null; d_env: string | null; d_created: number | null }>();
  const projects = results.map((r) => ({
    id: r.id, name: r.name, repo_full_name: r.repo_full_name, source: r.source, provider: r.provider, private: !!r.repo_private,
    framework: r.framework, webhook_status: r.webhook_status, status: r.status, url: r.url, created_at: r.created_at,
    latest_deployment: r.d_id ? { id: r.d_id, status: r.d_status, step: r.d_step, url: r.d_url, environment: r.d_env, created_at: r.d_created } : null,
  }));
  return ok({ projects });
}

export async function projectDeployments(c: Ctx, id: string): Promise<Response> {
  await ownedProject(c, id);
  const { results } = await c.env.DB.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 30').bind(id).all<DeploymentRow>();
  return ok({ deployments: await Promise.all(results.map(async (d) => deploymentPublic(await expireIfStuck(c.env, d)))) });
}

// ---------- deploy ----------
async function appendLog(env: Env, id: string, line: string): Promise<void> {
  await env.DB.prepare('UPDATE deployments SET log = substr(log || ?, -?) WHERE id = ?').bind(line + '\n', MAX_LOG, id).run();
}

async function markFailed(env: Env, id: string, reason: string): Promise<void> {
  await env.DB.prepare(`UPDATE deployments SET status = 'failed', step = 'failed', log = substr(log || ?, -?) WHERE id = ? AND status IN ('queued','building')`)
    .bind(`Deploy failed: ${reason}\n`, MAX_LOG, id)
    .run();
}

async function expireIfStuck(env: Env, d: DeploymentRow): Promise<DeploymentRow> {
  if ((d.status === 'queued' || d.status === 'building') && Date.now() - d.created_at > BUILD_TIMEOUT_MS) {
    await markFailed(env, d.id, 'the build pipeline did not report back within 20 minutes');
    return (await env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(d.id).first<DeploymentRow>())!;
  }
  return d;
}

async function signedHeaders(secret: string, body: string, event: string): Promise<Record<string, string>> {
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-aibotq-event': event,
    'x-aibotq-timestamp': ts,
    'x-aibotq-signature': 'sha256=' + (await hmacHex(secret, `${ts}.${body}`)),
  };
}

// Sends the build request to the pipeline. Marks the deployment failed (with the real reason) if it can't.
async function triggerBuild(c: Ctx, p: ProjectRow, d: DeploymentRow): Promise<string | null> {
  const env = c.env;
  try {
    if (!env.DEPLOY_WEBHOOK_URL) throw new Error('DEPLOY_WEBHOOK_URL is not configured');
    const secret = env.DEPLOY_WEBHOOK_SECRET;
    if (!secret) throw new Error('DEPLOY_WEBHOOK_SECRET is not configured');

    let source: Record<string, unknown>;
    if (p.source === 'upload') {
      source = { type: 'upload', manifest_url: await signedManifestUrl(c, p.upload_id!, p.user_id) };
    } else {
      const prov = p.provider!;
      source = { type: 'git', provider: prov, repo: p.repo_full_name, clone_url: cloneUrl(prov, p.repo_full_name!), branch: d.ref || p.branch, commit_sha: d.commit_sha, private: !!p.repo_private };
      // Private repos can't be cloned anonymously: the signed server-to-server request carries the owner's token.
      if (p.repo_private) {
        const t = await getToken(env, p.user_id, prov);
        if (!t) throw new Error(`${CFG[prov].label} is no longer connected for this project's owner`);
        source.token = t;
      }
    }
    const envVars = p.env_enc ? JSON.parse(await decrypt(env, p.env_enc)) : {};
    const body = JSON.stringify({
      deployment_id: d.id,
      environment: d.environment,
      project: { id: p.id, name: p.name, framework: p.framework, build_command: p.build_command, output_dir: p.output_dir, root_dir: p.root_dir },
      source,
      env: envVars,
      callback_url: `${appOrigin(env, c.url)}/api/deployments/${d.id}/callback`,
    });
    if (env.DEPLOY_WEBHOOK_URL === 'internal') {
      // Self-hosted pipeline: build in this Worker's Sandbox container, host on /sites/<slug>/.
      const ns = (env as any).SANDBOX;
      if (!ns) throw new Error('SANDBOX binding is missing');
      const job = JSON.parse(body);
      job.origin = appOrigin(env, c.url);
      await ns.getByName('build-' + p.id).startBuild(job);
      await env.DB.prepare(`UPDATE deployments SET status = 'building', step = 'build requested' WHERE id = ? AND status = 'queued'`).bind(d.id).run();
      await appendLog(env, d.id, 'Build queued on the aibotq builder.');
      return null;
    }
    let res: Response;
    try {
      res = await fetch(env.DEPLOY_WEBHOOK_URL, { method: 'POST', headers: await signedHeaders(secret, body, 'build'), body, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new Error(`build pipeline is unreachable (${e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : 'network error'})`);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      throw new Error(`build pipeline responded ${res.status}${text ? `: ${text}` : ''}`);
    }
    await env.DB.prepare(`UPDATE deployments SET status = 'building', step = 'build requested' WHERE id = ? AND status = 'queued'`).bind(d.id).run();
    await appendLog(env, d.id, 'Build request accepted by the pipeline.');
    return null;
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    await markFailed(env, d.id, reason);
    return reason;
  }
}

async function createDeployment(c: Ctx, p: ProjectRow, environment: 'production' | 'preview', ref: string | null, sha: string | null): Promise<DeploymentRow> {
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO deployments (id, project_id, step, status, log, commit_sha, environment, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, p.id, 'queued', 'queued', `Queued ${environment} deployment.\n`, sha, environment, ref, Date.now())
    .run();
  return (await c.env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(id).first<DeploymentRow>())!;
}

export async function projectDeploy(c: Ctx, id: string): Promise<Response> {
  const p = await ownedProject(c, id);
  await rateLimit(c.env, `deploy:${p.user_id}`, 10, 600);
  await rateLimit(c.env, `deploy-ip:${clientIp(c.req)}`, 30, 600);

  const active = await c.env.DB.prepare(`SELECT * FROM deployments WHERE project_id = ? AND status IN ('queued','building') ORDER BY created_at DESC LIMIT 1`).bind(id).first<DeploymentRow>();
  if (active && (await expireIfStuck(c.env, active)).status !== 'failed') throw new ApiError(409, 'A deployment for this project is already in progress', 'in_progress');

  const d = await createDeployment(c, p, 'production', p.branch, null);
  const reason = await triggerBuild(c, p, d);
  if (reason) {
    return new Response(JSON.stringify({ ok: false, error: `Deploy failed: ${reason}`, deployment_id: d.id }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const fresh = (await c.env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(d.id).first<DeploymentRow>())!;
  return ok({ deployment: deploymentPublic(fresh) }, 202);
}

export async function deploymentGet(c: Ctx, id: string): Promise<Response> {
  const user = await requireUser(c);
  const d = await c.env.DB.prepare('SELECT d.* FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.id = ? AND p.user_id = ?').bind(id, user.id).first<DeploymentRow>();
  if (!d) throw new ApiError(404, 'Deployment not found');
  return ok({ deployment: deploymentPublic(await expireIfStuck(c.env, d)) });
}

// Pipeline -> us. Signed with DEPLOY_WEBHOOK_SECRET: HMAC-SHA256 over `${timestamp}.${rawBody}`.
export async function deploymentCallback(c: Ctx, id: string): Promise<Response> {
  const secret = requireSecret(c.env, 'DEPLOY_WEBHOOK_SECRET');
  const raw = await c.req.text();
  if (raw.length > 128 * 1024) throw new ApiError(413, 'Body too large');
  const ts = c.req.headers.get('x-aibotq-timestamp') || '';
  const sig = (c.req.headers.get('x-aibotq-signature') || '').replace(/^sha256=/, '');
  const age = Math.abs(Date.now() / 1000 - parseInt(ts, 10));
  if (!(age <= 300) || !timingSafeEqual(sig, await hmacHex(secret, `${ts}.${raw}`))) throw new ApiError(401, 'Bad signature');

  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }
  const d = await c.env.DB.prepare('SELECT * FROM deployments WHERE id = ?').bind(id).first<DeploymentRow>();
  if (!d) throw new ApiError(404, 'Deployment not found');
  if (d.status === 'ready' || d.status === 'failed') throw new ApiError(409, 'Deployment already finished');

  const status = b.status;
  if (status !== 'building' && status !== 'ready' && status !== 'failed') throw new ApiError(400, 'status must be building, ready or failed');
  let url: string | null = null;
  if (b.url !== undefined && b.url !== null) {
    try {
      const u = new URL(String(b.url));
      if (u.protocol !== 'https:') throw new Error();
      url = u.toString();
    } catch {
      throw new ApiError(400, 'url must be an https URL');
    }
  }
  if (status === 'ready' && !url) throw new ApiError(400, 'A ready deployment needs a url');
  const step = typeof b.step === 'string' ? b.step.slice(0, 60) : status === 'ready' ? 'live' : status;
  const line = typeof b.log === 'string' ? b.log.slice(0, 8192) : '';
  const sha = typeof b.commit_sha === 'string' && /^[0-9a-f]{7,40}$/i.test(b.commit_sha) ? b.commit_sha : d.commit_sha;

  await c.env.DB.prepare('UPDATE deployments SET status = ?, step = ?, url = COALESCE(?, url), commit_sha = ?, log = substr(log || ?, -?) WHERE id = ?')
    .bind(status, step, url, sha, line ? line.replace(/\n?$/, '\n') : '', MAX_LOG, id)
    .run();
  if (status === 'ready' && d.environment === 'production') {
    await c.env.DB.prepare(`UPDATE projects SET status = 'live', url = ? WHERE id = ?`).bind(url, d.project_id).run();
  }
  return ok({ updated: true });
}

// ---------- GitHub webhook (push -> production, pull_request -> preview) ----------
export async function githubWebhook(c: Ctx): Promise<Response> {
  const secret = requireSecret(c.env, 'GITHUB_WEBHOOK_SECRET');
  const raw = await c.req.text();
  const sig = (c.req.headers.get('x-hub-signature-256') || '').replace(/^sha256=/, '');
  if (!sig || !timingSafeEqual(sig, await hmacHex(secret, raw))) throw new ApiError(401, 'Bad signature');

  const event = c.req.headers.get('x-github-event');
  if (event === 'ping') return ok({ pong: true });
  const b = JSON.parse(raw) as any;
  const full: string | undefined = b.repository?.full_name;
  if (!full) throw new ApiError(400, 'Missing repository');

  let environment: 'production' | 'preview';
  let ref: string;
  let sha: string | null;
  let branchGate: boolean;
  if (event === 'push') {
    if (b.deleted || typeof b.ref !== 'string' || !b.ref.startsWith('refs/heads/')) return ok({ ignored: 'not a branch push' }, 202);
    environment = 'production';
    ref = b.ref.slice('refs/heads/'.length);
    sha = b.after ?? null;
    branchGate = true;
  } else if (event === 'pull_request') {
    if (!['opened', 'synchronize', 'reopened'].includes(b.action)) return ok({ ignored: `pull_request ${b.action}` }, 202);
    // Fork PRs would run untrusted code next to the project's env vars.
    if (b.pull_request?.head?.repo?.full_name?.toLowerCase() !== b.pull_request?.base?.repo?.full_name?.toLowerCase()) return ok({ ignored: 'pull request from a fork' }, 202);
    environment = 'preview';
    ref = b.pull_request.head.ref;
    sha = b.pull_request.head.sha ?? null;
    branchGate = false;
  } else {
    return ok({ ignored: `event ${event}` }, 202);
  }

  const { results } = await c.env.DB.prepare(`SELECT * FROM projects WHERE provider = 'github' AND repo_full_name = ? COLLATE NOCASE AND webhook_status = 'active'`).bind(full).all<ProjectRow>();
  const started: string[] = [];
  for (const p of results) {
    if (branchGate && p.branch !== ref) continue;
    const d = await createDeployment(c, p, environment, ref, sha);
    started.push(d.id);
    c.ctx.waitUntil(triggerBuild(c, p, d).then(() => undefined));
  }
  return ok({ deployments: started }, 202);
}
