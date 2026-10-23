import { authCallback, authStart, config, logout, me } from './auth';
import { ApiError, checkCsrf, fail } from './lib';
import { deploymentCallback, deploymentGet, githubWebhook, projectCreate, projectDeploy, projectDeployments, projectGet, projectList } from './projects';
import { reposDetect, reposList, reposResolve, templateCreate, templatesList, upload, uploadFile, uploadManifest } from './repos';
import type { Ctx, Env } from './types';

type Handler = (c: Ctx, ...params: string[]) => Response | Promise<Response>;
interface Route {
  method: string;
  re: RegExp;
  handler: Handler;
  // Server-to-server routes authenticate with HMAC signatures instead of cookies, so no Origin check.
  signed?: boolean;
}

const seg = '([^/]+)';
const routes: Route[] = [
  { method: 'GET', re: /^\/api\/config$/, handler: config },
  { method: 'GET', re: /^\/api\/me$/, handler: me },
  { method: 'POST', re: /^\/api\/auth\/logout$/, handler: logout },
  { method: 'GET', re: new RegExp(`^/api/auth/${seg}/callback$`), handler: authCallback },
  { method: 'GET', re: new RegExp(`^/api/auth/${seg}$`), handler: authStart },
  { method: 'GET', re: /^\/api\/repos$/, handler: reposList },
  { method: 'GET', re: /^\/api\/repos\/detect$/, handler: reposDetect },
  { method: 'POST', re: /^\/api\/repos\/resolve$/, handler: reposResolve },
  { method: 'POST', re: /^\/api\/upload$/, handler: upload },
  { method: 'GET', re: new RegExp(`^/api/uploads/${seg}/manifest$`), handler: uploadManifest },
  { method: 'GET', re: new RegExp(`^/api/uploads/${seg}/file$`), handler: uploadFile },
  { method: 'GET', re: /^\/api\/templates$/, handler: templatesList },
  { method: 'POST', re: new RegExp(`^/api/templates/${seg}/create$`), handler: templateCreate },
  { method: 'GET', re: /^\/api\/projects$/, handler: projectList },
  { method: 'POST', re: /^\/api\/projects$/, handler: projectCreate },
  { method: 'GET', re: new RegExp(`^/api/projects/${seg}/deployments$`), handler: projectDeployments },
  { method: 'GET', re: new RegExp(`^/api/projects/${seg}$`), handler: projectGet },
  { method: 'POST', re: new RegExp(`^/api/projects/${seg}/deploy$`), handler: projectDeploy },
  { method: 'GET', re: new RegExp(`^/api/deployments/${seg}$`), handler: deploymentGet },
  { method: 'POST', re: new RegExp(`^/api/deployments/${seg}/callback$`), handler: deploymentCallback, signed: true },
  { method: 'POST', re: /^\/api\/webhooks\/github$/, handler: githubWebhook, signed: true },
];

export async function handle(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const c: Ctx = { req, env, ctx, url };
  try {
    const path = url.pathname.replace(/\/+$/, '') || '/';
    let pathMatched = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      if (req.method !== 'GET' && !r.signed) checkCsrf(c);
      return await r.handler(c, ...m.slice(1).map(decodeURIComponent));
    }
    return fail(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, undefined, e.code);
    console.error('unhandled', e instanceof Error ? e.message : 'unknown error');
    return fail(500, 'Internal error');
  }
}

