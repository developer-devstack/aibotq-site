// Docker Cloud Sandboxes (Docker Agentic Platform) via plain REST/fetch — Workers-compatible, no SDK.
// Auth: DOCKER_ID + DOCKER_PAT (scope sandbox:use) -> short-lived JWT at hub.docker.com/v2/auth/token.
// One sandbox per chat identity, found by label. Every sandbox is created with a server-side timeout
// (onTimeout=delete) that is renewed on each use, so idle sandboxes are deleted by Docker even if we never call back.
const API = 'https://connect.docker.com/sandboxes/v1'
const IDLE = '600s'
const CAP = 16_000
const cap = (s: string) => s.length > CAP ? s.slice(0, CAP) + `\n…[truncated ${s.length - CAP} chars]` : s
const b64dec = (s?: string) => { if (!s) return ''; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u) }
// Minimal 'shell' kit manifest (no injected credentials): Docker's shell template image.
const KIT = btoa(JSON.stringify({ manifest: { schemaVersion: '2', kind: 'sandbox', name: 'shell', template: 'docker/sandbox-templates:shell-docker', runOptions: ['-l'], interactiveOptions: ['-l'] } }))
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let hub: { t: string, exp: number, id: string } | null = null
const creds = new Map<string, { t: string, exp: number }>()

export const dockerEnabled = (env: any) => !!(env?.DOCKER_ID && env?.DOCKER_PAT)

// hub.docker.com rate-limits token exchange per source IP (Cloudflare egress IPs are shared), so cache the
// 15-min JWT across isolates in the colo-local Cache API and retry 429s with backoff.
const CK = 'https://aibotq.internal/docker-hub-token'
async function hubToken(env: any, force = false) {
  if (!force && hub && hub.id === env.DOCKER_ID && hub.exp > Date.now() + 60_000) return hub.t
  const cache = (globalThis as any).caches?.default as Cache | undefined
  const ck = CK + '/' + encodeURIComponent(env.DOCKER_ID) + '/' + (await sha(env.DOCKER_PAT)).slice(0, 16)
  if (!force && cache) { const c = await cache.match(ck).catch(() => undefined); if (c) { const j = await c.json() as any; if (j.exp > Date.now() + 60_000) { hub = { t: j.t, exp: j.exp, id: env.DOCKER_ID }; return j.t } } }
  let r: Response | null = null
  for (let i = 0; i < 4; i++) {
    r = await fetch('https://hub.docker.com/v2/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: env.DOCKER_ID, secret: env.DOCKER_PAT }) })
    if (r.status !== 429 && r.status < 500) break
    await sleep(800 * (i + 1))
  }
  if (!r!.ok) throw new Error(`Docker auth failed (${r!.status})`)
  const t = (await r!.json() as any).access_token as string
  let exp = Date.now() + 4 * 60_000
  try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.exp) exp = p.exp * 1000 } catch {}
  hub = { t, exp, id: env.DOCKER_ID }
  if (cache) { const ttl = Math.max(60, Math.floor((exp - Date.now()) / 1000) - 90); await cache.put(ck, new Response(JSON.stringify({ t, exp }), { headers: { 'cache-control': 'max-age=' + ttl } })).catch(() => {}) }
  return t
}
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('')

async function api(env: any, method: string, path: string, body?: any, retry = true): Promise<any> {
  const r = await fetch(API + path, { method, headers: { authorization: 'Bearer ' + await hubToken(env), 'content-type': 'application/json', ...(method === 'POST' && path === '/sandboxes' ? { 'idempotency-key': crypto.randomUUID() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (r.status === 401 && retry) { hub = null; return api(env, method, path, body, false) }
  const txt = await r.text()
  if (!r.ok) throw new Error(`Docker API ${method} ${path.split('?')[0]} -> ${r.status}: ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : {}
}

const uid = (s: any) => String(s?.core?.sandboxUid || s?.core?.endpoint?.sandboxUid || s?.name || '').replace(/^sandboxes\//, '')
const status = (s: any) => String(s?.core?.status || s?.status || '')

async function find(env: any, label: string) {
  let tok = ''
  for (let i = 0; i < 10; i++) {
    const r = await api(env, 'GET', '/sandboxes?pageSize=100' + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''))
    const hit = (r.sandboxes || []).find((s: any) => (s.core?.labels || s.labels || {}).aibotq === label && !/delet/i.test(status(s)))
    if (hit) return hit
    tok = r.nextPageToken; if (!tok) return null
  }
  return null
}

async function waitRunning(env: any, id: string) {
  for (let i = 0; i < 60; i++) {
    const s = await api(env, 'GET', '/sandboxes/' + id)
    const st = status(s)
    if (/running/i.test(st) && s.core?.endpoint?.uri) return s
    if (/fail|error|delet/i.test(st)) throw new Error('Docker sandbox ' + st)
    await sleep(1000)
  }
  throw new Error('Docker sandbox did not start in time')
}

async function ensure(env: any, key: string, internet: boolean) {
  const label = (key + (internet ? '-net' : '')).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60)
  let s = await find(env, label)
  if (!s) {
    s = await api(env, 'POST', '/sandboxes', {
      displayName: 'aibotq-' + label,
      labels: { aibotq: label },
      kits: [{ artifact: { ref: { ref: 'shell', kind: 'sandbox' }, inline: KIT } }],
      resources: { cpus: 2, memoryMib: '4096' },
      ...(internet ? {} : { networkPolicies: [{ mode: 'denyAll', denyNetworks: ['*', '0.0.0.0/0', '::/0'] }] }),
      features: { timeouts: { timeout: IDLE, onTimeout: 'delete' } },
    })
  } else if (/stop/i.test(status(s))) {
    await api(env, 'POST', '/sandboxes/' + uid(s) + '/start', {})
  }
  const id = uid(s)
  s = /running/i.test(status(s)) && s.core?.endpoint?.uri ? s : await waitRunning(env, id)
  // push the idle deadline forward on every use; Docker deletes the sandbox when it passes
  await api(env, 'POST', '/sandboxes/' + id + '/renew-timeout', { timeout: IDLE }).catch(() => {})
  return { id, uri: s.core.endpoint.uri as string }
}

async function cred(env: any, id: string, perm: string) {
  const k = id + ':' + perm, c = creds.get(k)
  if (c && c.exp > Date.now() + 20_000) return c.t
  const r = await api(env, 'POST', `/sandboxes/${id}/endpoint-credentials`, { permissions: [perm] })
  const exp = r.expireTime ? Date.parse(r.expireTime) : Date.now() + 240_000
  creds.set(k, { t: r.token, exp })
  return r.token as string
}

async function ep(env: any, sb: { id: string, uri: string }, perm: string, method: string, path: string, body?: BodyInit, ct = 'application/json') {
  const r = await fetch(sb.uri + path, { method, headers: { authorization: 'Bearer ' + await cred(env, sb.id, perm), 'content-type': ct, ...(path === '/v1/processes' ? { 'idempotency-key': crypto.randomUUID() } : {}) }, body })
  const txt = await r.text()
  if (!r.ok) throw new Error(`Docker sandbox ${method} ${path.split('?')[0]} -> ${r.status}: ${txt.slice(0, 300)}`)
  return txt
}

export function dockerSandbox(env: any, key: string, internet: boolean) {
  const get = async () => {
    const sb = await ensure(env, key, internet)
    // shell template runs as a non-root user; create /workspace as root once and hand it over
    const r = JSON.parse(await ep(env, sb, 'sandboxesExec', 'POST', '/v1/processes/exec', JSON.stringify({ cmd: ['sh', '-c', 'mkdir -p /workspace && chmod 1777 /workspace'], user: 'root' })))
    if (r.exitCode) throw new Error('Docker sandbox setup failed: ' + b64dec(r.stderr).slice(0, 200))
    return sb
  }
  return {
    provider: 'docker',
    async exec(argv: string[], o: { timeoutSec?: number } = {}) {
      const sb = await get()
      const t = Math.min(Math.max(o.timeoutSec || 30, 1), 120)
      const started = Date.now()
      const r = JSON.parse(await ep(env, sb, 'sandboxesExec', 'POST', '/v1/processes/exec', JSON.stringify({ cmd: ['timeout', '-k', '2', String(t), ...argv], workingDir: '/workspace' })))
      const exitCode = r.exitCode ?? 0
      return { provider: 'docker', exitCode, timedOut: exitCode === 124, stdout: cap(b64dec(r.stdout)), stderr: cap(b64dec(r.stderr)), ms: Date.now() - started }
    },
    async write(path: string, content: string) {
      const sb = await get()
      await ep(env, sb, 'sandboxesFilesWrite', 'PUT', '/v1/files/content?path=' + encodeURIComponent(path), content, 'application/octet-stream')
      return { provider: 'docker', ok: true, path, bytes: content.length }
    },
    async read(path: string) {
      const sb = await get()
      return { provider: 'docker', path, content: cap(await ep(env, sb, 'sandboxesFilesRead', 'GET', '/v1/files/content?path=' + encodeURIComponent(path))) }
    },
  }
}
