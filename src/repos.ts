import { requireUser } from './auth';
import { ApiError, hmacHex, ok, parseTemplates, rateLimit, readJson, requireSecret, timingSafeEqual } from './lib';
import { CFG, api, apiJson, detectFramework, getRepo, getToken, listRepos, parseRepoUrl, providerError, readRepoFile, requireToken } from './providers';
import { PROVIDERS, type Ctx, type Provider } from './types';

function providerParam(c: Ctx, v: string | null): Provider {
  const p = (v || 'github') as Provider;
  if (!PROVIDERS.includes(p)) throw new ApiError(400, 'Unknown provider');
  return p;
}

export async function reposList(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const p = providerParam(c, c.url.searchParams.get('provider'));
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(1000, parseInt(c.url.searchParams.get('page') || '1', 10) || 1));
  const token = await requireToken(c.env, user.id, p);
  return ok(await listRepos(p, token, q, page));
}

export async function reposResolve(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const body = await readJson<{ url?: unknown }>(c.req);
  if (typeof body.url !== 'string' || !body.url) throw new ApiError(400, 'Enter a repository URL');
  const { provider, full_name } = parseRepoUrl(body.url);
  const token = await getToken(c.env, user.id, provider);
  try {
    return ok({ repo: await getRepo(provider, token, full_name) });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_found') {
      throw new ApiError(404, `Repository ${full_name} was not found on ${CFG[provider].label}. It may be private or misspelled${token ? '' : ' — sign in to import private repositories'}.`, 'not_found');
    }
    throw e;
  }
}

export async function reposDetect(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  const q = c.url.searchParams;
  const p = providerParam(c, q.get('provider'));
  const full = q.get('repo') || '';
  const root = (q.get('root') || '').replace(/^\/+|\/+$/g, '');
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(full)) throw new ApiError(400, 'Invalid repo name');
  if (root.split('/').includes('..') || !/^[\w./-]*$/.test(root)) throw new ApiError(400, 'Invalid root directory');
  const token = await getToken(c.env, user.id, p);
  const repo = await getRepo(p, token, full);
  const branch = q.get('branch') || repo.default_branch;
  const text = await readRepoFile(p, token, full, branch, (root ? root + '/' : '') + 'package.json');
  let pkg: any = null;
  if (text !== null) {
    try {
      pkg = JSON.parse(text);
    } catch {
      throw new ApiError(422, 'package.json exists but is not valid JSON');
    }
  }
  return ok({ ...detectFramework(pkg), has_package_json: pkg !== null, default_branch: repo.default_branch, branch, name: (pkg?.name as string) || repo.name });
}

// ---------- templates ----------
export function templatesList(c: Ctx): Response {
  const templates = parseTemplates(c.env);
  return ok({ templates: Object.entries(templates).map(([id, repo]) => ({ id, repo })) });
}

export async function templateCreate(c: Ctx, id: string): Promise<Response> {
  const user = await requireUser(c);
  await rateLimit(c.env, `tpl:${user.id}`, 10, 3600);
  const tpl = parseTemplates(c.env)[id];
  if (!tpl) throw new ApiError(404, `Unknown template "${id.slice(0, 40)}"`);
  const body = await readJson<{ name?: unknown; private?: unknown }>(c.req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..') {
    throw new ApiError(400, 'Repository name may only contain letters, numbers, ".", "-" and "_" (max 100 chars)');
  }
  const token = await requireToken(c.env, user.id, 'github');
  const { data: me } = await apiJson('github', token, '/user');

  const res = await api('github', token, `/repos/${tpl}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner: me.login, name, private: body.private !== false, description: `Created from the ${id} template on Aibotq.dev` }),
  });
  if (!res.ok) {
    const err = await providerError('github', res);
    if (err.code === 'not_found') throw new ApiError(404, `Template repository ${tpl} was not found on GitHub, or it is not marked as a template repository.`, 'not_found');
    if (err.code === 'unprocessable') throw new ApiError(422, `Could not create "${name}": ${err.message.replace(/^GitHub: /, '')}`);
    throw err;
  }
  const r = (await res.json()) as any;
  return ok({
    template: id,
    repo: { provider: 'github', full_name: r.full_name, name: r.name, private: !!r.private, default_branch: r.default_branch || 'main', html_url: r.html_url, description: r.description ?? null, updated_at: null, language: null },
  });
}

// ---------- uploads (R2) ----------
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_FILES = 1000;
const BLOCKED_SEGMENTS = new Set(['node_modules', '.git', '.next', '.wrangler', '.env']);

export function safeUploadPath(p: string): string | null {
  const clean = p.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = clean.split('/');
  if (!clean || clean.length > 300 || parts.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (parts.some((s) => BLOCKED_SEGMENTS.has(s) || s.startsWith('.env'))) return null;
  return clean;
}

export async function upload(c: Ctx): Promise<Response> {
  const user = await requireUser(c);
  if (!c.env.UPLOADS) throw new ApiError(501, 'Upload is not enabled on this deployment (no R2 bucket is bound to UPLOADS).', 'upload_disabled');
  await rateLimit(c.env, `upload:${user.id}`, 20, 3600);
  const len = parseInt(c.req.headers.get('content-length') || '0', 10);
  if (len > MAX_UPLOAD_BYTES + 1024 * 1024) throw new ApiError(413, `Upload too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  if (!(c.req.headers.get('content-type') || '').startsWith('multipart/form-data')) throw new ApiError(400, 'Expected multipart/form-data');

  const form = await c.req.formData();
  const files = (form.getAll('files') as unknown[]).filter((f): f is File => typeof f !== 'string');
  if (!files.length) throw new ApiError(400, 'No files received');
  if (files.length > MAX_UPLOAD_FILES) throw new ApiError(413, `Too many files (limit ${MAX_UPLOAD_FILES}) — exclude node_modules and build output`);

  const entries: { path: string; file: File }[] = [];
  let bytes = 0;
  for (const f of files) {
    const path = safeUploadPath(f.name);
    if (!path) continue; // skipped: node_modules, .git, .env*, traversal
    bytes += f.size;
    entries.push({ path, file: f });
  }
  if (!entries.length) throw new ApiError(400, 'No uploadable files (node_modules, .git and .env files are skipped)');
  if (bytes > MAX_UPLOAD_BYTES) throw new ApiError(413, `Upload too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);

  const id = crypto.randomUUID();
  const prefix = `uploads/${user.id}/${id}/`;
  for (const e of entries) await c.env.UPLOADS.put(prefix + e.path, e.file.stream(), { httpMetadata: { contentType: e.file.type || 'application/octet-stream' } });
  await c.env.DB.prepare('INSERT INTO uploads (id, user_id, file_count, bytes, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, entries.length, bytes, Date.now()).run();
  return ok({ upload_id: id, file_count: entries.length, skipped: files.length - entries.length, bytes });
}

// The build pipeline downloads uploads through short-lived HMAC-signed URLs (no session cookie).
export async function signedManifestUrl(c: Ctx, uploadId: string, userId: string): Promise<string> {
  const secret = requireSecret(c.env, 'DEPLOY_WEBHOOK_SECRET');
  const exp = Date.now() + 3600_000;
  const sig = await hmacHex(secret, `${uploadId}|${userId}|manifest|${exp}`);
  return `${c.env.APP_URL || c.url.origin}/api/uploads/${uploadId}/manifest?u=${userId}&exp=${exp}&sig=${sig}`;
}

async function verifyUploadSig(c: Ctx, uploadId: string, what: string): Promise<void> {
  const exp = parseInt(c.url.searchParams.get('exp') || '0', 10);
  const sig = c.url.searchParams.get('sig') || '';
  const userId = c.url.searchParams.get('u') || '';
  const expect = await hmacHex(requireSecret(c.env, 'DEPLOY_WEBHOOK_SECRET'), `${uploadId}|${userId}|${what}|${exp}`);
  if (!exp || exp < Date.now() || !timingSafeEqual(sig, expect)) throw new ApiError(403, 'Invalid or expired signature');
}

export async function uploadManifest(c: Ctx, uploadId: string): Promise<Response> {
  await verifyUploadSig(c, uploadId, 'manifest');
  if (!c.env.UPLOADS) throw new ApiError(501, 'Upload is not enabled', 'upload_disabled');
  const userId = c.url.searchParams.get('u') || '';
  const secret = requireSecret(c.env, 'DEPLOY_WEBHOOK_SECRET');
  const exp = Date.now() + 3600_000;
  const prefix = `uploads/${userId}/${uploadId}/`;
  const files: { path: string; size: number; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const list = await c.env.UPLOADS.list({ prefix, cursor, limit: 1000 });
    for (const o of list.objects) {
      const path = o.key.slice(prefix.length);
      const sig = await hmacHex(secret, `${uploadId}|${userId}|${path}|${exp}`);
      files.push({ path, size: o.size, url: `${c.env.APP_URL || c.url.origin}/api/uploads/${uploadId}/file?u=${userId}&path=${encodeURIComponent(path)}&exp=${exp}&sig=${sig}` });
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return ok({ upload_id: uploadId, files });
}

export async function uploadFile(c: Ctx, uploadId: string): Promise<Response> {
  const path = c.url.searchParams.get('path') || '';
  await verifyUploadSig(c, uploadId, path);
  if (!c.env.UPLOADS) throw new ApiError(501, 'Upload is not enabled', 'upload_disabled');
  const userId = c.url.searchParams.get('u') || '';
  if (!safeUploadPath(path)) throw new ApiError(400, 'Bad path');
  const obj = await c.env.UPLOADS.get(`uploads/${userId}/${uploadId}/${path}`);
  if (!obj) throw new ApiError(404, 'File not found');
  return new Response(obj.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
