// Chat tools. Public tools are safe/read-only. Admin tools require a verified ADMIN_CHAT_TOKEN (server-side compare)
// and every write tool returns a signed *pending action* that only runs after the user clicks Confirm in /chat.
import { projectList } from '../lib/projects'
import { hmacHex, timingSafeEqual } from '../lib/lib'
import { dockerEnabled, dockerSandbox } from './docker-sandbox'
import { runClairic } from './clairic'
import { rateLimit } from '../lib/lib'

export type ToolCtx = { env: any, req: Request, admin: boolean, files: { name: string, text: string }[], images?: { name: string, dataUrl: string }[], lastUserMessage?: string, user?: { login: string, name: string | null } | null }
// Sandbox provider: Docker Cloud Sandboxes first (billed to Docker Agentic Platform credit), Cloudflare Sandbox as fallback.
const cfSbx = (c: ToolCtx) => { if (!c.env.SANDBOX) throw new Error('Sandbox is not configured on this server.'); return c.env.SANDBOX.getByName(c.user ? 'gh-' + c.user.login.toLowerCase() : 'owner') }
const sbx = (c: ToolCtx) => {
  if (!c.user && !c.admin) throw new Error('Sign in with GitHub to use the sandbox.')
  const key = c.user ? 'gh-' + c.user.login.toLowerCase() : 'owner'
  const d = dockerEnabled(c.env) ? dockerSandbox(c.env, key, c.admin) : null
  const run = async (name: 'exec' | 'write' | 'read', dArgs: any[], cfArgs: any[]) => {
    if (d) { try { return await (d as any)[name](...dArgs) } catch (e: any) { if (!c.env.SANDBOX) throw e; const r = await (cfSbx(c) as any)[name](...cfArgs); return { ...r, provider: 'cloudflare', fallbackReason: String(e?.message || e).slice(0, 200) } } }
    return { ...(await (cfSbx(c) as any)[name](...cfArgs)), provider: 'cloudflare' }
  }
  return {
    exec: (argv: string[], o: { timeoutSec?: number, internet?: boolean }) => run('exec', [argv, o], [argv, o]),
    write: (p: string, content: string, internet: boolean) => run('write', [p, content], [p, content, internet]),
    read: (p: string, internet: boolean) => run('read', [p], [p, internet]),
  }
}
const tsec = (a: any, c: ToolCtx) => Math.min(Number(a.timeout_sec) || 30, c.admin ? 120 : 30)
export type Tool = { name: string, description: string, schema: any, admin?: boolean, auth?: boolean, write?: boolean, run: (a: any, c: ToolCtx) => Promise<any> }

const REPO = (env: any) => env.ADMIN_REPO || 'thanabartbb/aibotq-site'
const MAX = 20000

function privateHost(h: string) {
  h = h.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) { const [a, b] = [+m[1]!, +m[2]!]; return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) }
  if (h.includes(':')) return h === '::1' || h === '::' || /^(fc|fd|fe80|::ffff)/.test(h)
  return false
}
function htmlToText(s: string) {
  return s.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
}
async function gh(env: any, path: string, init: RequestInit = {}) {
  if (!env.GITHUB_ADMIN_TOKEN) throw new Error('GITHUB_ADMIN_TOKEN secret is not set on the server, so repo tools are unavailable.')
  const r = await fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${env.GITHUB_ADMIN_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'aibotq-chat', 'x-github-api-version': '2022-11-28', ...(init.body ? { 'content-type': 'application/json' } : {}) } })
  const j: any = r.status === 204 ? {} : await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j?.message || 'error'}`)
  return j
}
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)))

export const TOOLS: Tool[] = [
  { name: 'current_time', description: 'Get the current date and time. Use whenever the user asks about today, now, dates, or time in some timezone.',
    schema: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA timezone, e.g. Asia/Bangkok. Default UTC.' } } },
    async run(a) { const tz = a?.timezone || 'UTC'; const d = new Date(); try { return { iso_utc: d.toISOString(), timezone: tz, local: d.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }) } } catch { return { error: `Unknown timezone ${tz}`, iso_utc: d.toISOString() } } } },
  { name: 'web_fetch', description: 'Fetch a public web page or file by URL and return its readable text (truncated to ~20k chars). Use when the user gives a URL or asks about the content of a specific website/docs page.',
    schema: { type: 'object', properties: { url: { type: 'string', description: 'Absolute http(s) URL' } }, required: ['url'] },
    async run(a) {
      let u: URL; try { u = new URL(a.url) } catch { return { error: 'Invalid URL' } }
      for (let i = 0; i < 4; i++) {
        if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname) || (u.port && !['80', '443'].includes(u.port))) return { error: 'URL not allowed (private/local address or non-http)' }
        const r = await fetch(u.toString(), { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; aibotq-chat/1.0)', accept: 'text/html,text/plain,application/json,*/*' } })
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location')!, u); continue }
        const ct = r.headers.get('content-type') || ''
        if (!/text|json|xml|javascript/.test(ct)) return { url: u.toString(), status: r.status, error: `Unsupported content-type ${ct}` }
        const reader = r.body!.getReader(); const chunks: Uint8Array[] = []; let n = 0
        while (n < 1_500_000) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length }
        reader.cancel().catch(() => {})
        const raw = new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c => [...c])))
        const text = /html/.test(ct) ? htmlToText(raw) : raw
        const title = raw.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim()
        return { url: u.toString(), status: r.status, title, text: text.slice(0, MAX), truncated: text.length > MAX }
      }
      return { error: 'Too many redirects' }
    } },
  { name: 'read_uploaded_file', description: 'Read the text of a file the user attached in this chat (text, code, markdown, JSON, CSV or PDF). Call with no name to list attached files.',
    schema: { type: 'object', properties: { name: { type: 'string', description: 'File name as attached' } } },
    async run(a, c) {
      if (!c.files.length) return { error: 'No files are attached in this chat.' }
      const f = a?.name ? c.files.find(x => x.name === a.name) : (c.files.length === 1 ? c.files[0] : null)
      if (!f) return { files: c.files.map(x => ({ name: x.name, chars: x.text.length })) }
      return { name: f.name, text: f.text.slice(0, 60000), truncated: f.text.length > 60000 }
    } },
  { name: 'list_projects', description: "List the signed-in user's aibotq.dev projects with their latest deployment status and URL.",
    schema: { type: 'object', properties: {} }, run: async (_a, c) => projects(c) },
  { name: 'deploy_status', description: 'Get the latest deployment status of one of the signed-in user\'s projects, by project name or id.',
    schema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
    async run(a, c) { const r: any = await projects(c); if (r.error) return r; const p = r.projects.find((x: any) => x.id === a.project || x.name?.toLowerCase() === String(a.project).toLowerCase()); return p || { error: `No project named ${a.project}`, available: r.projects.map((x: any) => x.name) } } },
  { name: 'extract_data', auth: true, description: "Extract typed values (text, number, date, time, datetime, duration, list, estimate, forecast) from text and/or up to 4 images with Cloudflare Clairic. Returns value, confidence, p_null and p10/p90 per field; values marked uncertain must be presented as uncertain. state defaults to the user's last message plus attached text files.",
    schema: { type: 'object', properties: {
      state: { type: 'string', description: "Text to read. Omit to use the user's message and attached text." },
      image_urls: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'https URLs of PNG/JPEG/WebP images (attached images are included automatically)' },
      fields: { type: 'object', description: 'Map of field name -> { type, instructions?, unit?, decimals?, integer?, items?, min?, max?, step?, steps? }', additionalProperties: true },
    }, required: ['fields'] },
    async run(a, c) {
      const who = c.user ? 'gh-' + c.user.login.toLowerCase() : 'owner'
      if (c.env.DB) await rateLimit(c.env, `clairic:${who}`, c.admin ? 120 : 20, 3600)
      const state = a.state ? String(a.state) : [c.lastUserMessage || '', ...c.files.map(f => `--- ${f.name} ---\n${f.text}`)].filter(Boolean).join('\n\n')
      const images = [...(c.images || []).map(i => i.dataUrl), ...((Array.isArray(a.image_urls) ? a.image_urls : []).map(String))].slice(0, 4)
      return runClairic(c.env, { state, images, fields: a.fields })
    } },
  // ---- sandbox tools (signed-in users; owners get internet + longer timeouts) ----
  { name: 'run_code', auth: true, description: 'Run a Python or JavaScript (Node 24) snippet in your private Linux sandbox and return stdout/stderr/exitCode. Files persist in /workspace for ~10 min of idle time.',
    schema: { type: 'object', properties: { language: { type: 'string', enum: ['python', 'js'] }, code: { type: 'string' }, timeout_sec: { type: 'number' } }, required: ['language', 'code'] },
    run: async (a, c) => { const s = sbx(c), f = a.language === 'python' ? '/workspace/.run.py' : '/workspace/.run.mjs'; await s.write(f, String(a.code), c.admin); return s.exec([a.language === 'python' ? 'python3' : 'node', f], { timeoutSec: tsec(a, c), internet: c.admin }) } },
  { name: 'run_command', auth: true, description: 'Run a shell command (bash -lc) in your private Linux sandbox (cwd /workspace). Internet access only for the site owner.',
    schema: { type: 'object', properties: { command: { type: 'string' }, timeout_sec: { type: 'number' } }, required: ['command'] },
    run: async (a, c) => sbx(c).exec(['bash', '-lc', String(a.command)], { timeoutSec: tsec(a, c), internet: c.admin }) },
  { name: 'write_file', auth: true, description: 'Write a text file in your sandbox (path under /workspace).',
    schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    run: async (a, c) => { const p = String(a.path).startsWith('/') ? String(a.path) : '/workspace/' + a.path; if (!c.admin && !p.startsWith('/workspace/')) throw new Error('Path must be under /workspace'); return sbx(c).write(p, String(a.content).slice(0, 500000), c.admin) } },
  { name: 'read_file', auth: true, description: 'Read a text file from your sandbox.',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run: async (a, c) => { const p = String(a.path).startsWith('/') ? String(a.path) : '/workspace/' + a.path; if (!c.admin && !p.startsWith('/workspace/')) throw new Error('Path must be under /workspace'); return sbx(c).read(p, c.admin) } },
  // ---- admin (owner) tools ----
  { name: 'list_repo_files', admin: true, description: 'Owner only. List files of the aibotq.dev website source repo (optionally under a path prefix).',
    schema: { type: 'object', properties: { prefix: { type: 'string' }, ref: { type: 'string', description: 'branch, default main' } } },
    async run(a, c) { const t = await gh(c.env, `/repos/${REPO(c.env)}/git/trees/${encodeURIComponent(a?.ref || 'main')}?recursive=1`); const files = t.tree.filter((x: any) => x.type === 'blob' && (!a?.prefix || x.path.startsWith(a.prefix))).map((x: any) => x.path); return { count: files.length, files: files.slice(0, 400) } } },
  { name: 'read_repo_file', admin: true, description: 'Owner only. Read one file from the website source repo.',
    schema: { type: 'object', properties: { path: { type: 'string' }, ref: { type: 'string' } }, required: ['path'] },
    async run(a, c) { const f = await gh(c.env, `/repos/${REPO(c.env)}/contents/${a.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(a.ref || 'main')}`); const text = unb64(f.content || ''); return { path: a.path, text: text.slice(0, 60000), truncated: text.length > 60000 } } },
  { name: 'propose_change', admin: true, write: true, description: 'Owner only. Propose a code change: creates a new branch, commits the given full file contents, and opens a pull request (never merges). Requires the owner to click Confirm. Always read files first and send complete new file contents.',
    schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, branch: { type: 'string', description: 'new branch name, e.g. chat/fix-hero' }, files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }, required: ['title', 'branch', 'files'] },
    async run(a, c) {
      const R = REPO(c.env); const branch = String(a.branch).replace(/[^\w./-]/g, '-'); if (branch === 'main') return { error: 'Cannot commit to main' }
      const base = await gh(c.env, `/repos/${R}/git/ref/heads/main`); const baseSha = base.object.sha
      const commit = await gh(c.env, `/repos/${R}/git/commits/${baseSha}`)
      const tree = await gh(c.env, `/repos/${R}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: a.files.map((f: any) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }) })
      const nc = await gh(c.env, `/repos/${R}/git/commits`, { method: 'POST', body: JSON.stringify({ message: a.title, tree: tree.sha, parents: [baseSha] }) })
      await gh(c.env, `/repos/${R}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: nc.sha }) })
      const pr = await gh(c.env, `/repos/${R}/pulls`, { method: 'POST', body: JSON.stringify({ title: a.title, head: branch, base: 'main', body: (a.description || '') + '\n\nProposed via aibotq.dev admin chat.' }) })
      return { pr_url: pr.html_url, number: pr.number, branch }
    } },
  { name: 'trigger_deploy', admin: true, write: true, description: 'Owner only. Run the GitHub Actions "deploy.yml" workflow to build and deploy the website from a branch (default main). Requires the owner to click Confirm.',
    schema: { type: 'object', properties: { ref: { type: 'string' } } },
    async run(a, c) { const ref = a?.ref || 'main'; await gh(c.env, `/repos/${REPO(c.env)}/actions/workflows/deploy.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref }) }); return { started: true, ref, runs: `https://github.com/${REPO(c.env)}/actions/workflows/deploy.yml` } } },
]

async function projects(c: ToolCtx) {
  if (!c.env.DB) return { error: 'Project database not available.' }
  try { const r = await projectList({ req: c.req, env: c.env, ctx: {} as any, url: new URL(c.req.url) } as any); const j: any = await r.json(); return r.ok ? { projects: j.data?.projects ?? j.projects ?? [] } : { error: 'Sign in required: the user must sign in on aibotq.dev to see their projects.' } }
  catch (e: any) { return { error: e?.status === 401 || /sign|auth/i.test(e?.message || '') ? 'Sign in required: the user must sign in on aibotq.dev to see their projects.' : 'Could not load projects: ' + e?.message } }
}

export async function isAdmin(env: any, token?: string) {
  if (!env.ADMIN_CHAT_TOKEN || !token) return false
  return timingSafeEqual(await hmacHex(env.ADMIN_CHAT_TOKEN, token), await hmacHex(env.ADMIN_CHAT_TOKEN, env.ADMIN_CHAT_TOKEN))
}
export const toolsFor = (admin: boolean, signedIn = false) => TOOLS.filter(t => (admin || !t.admin) && (signedIn || admin || !t.auth))

// Pending write actions are HMAC-signed so the browser can't alter them between proposal and confirmation.
export async function signAction(env: any, tool: string, args: any) { const payload = JSON.stringify({ tool, args, exp: Date.now() + 30 * 60_000 }); return { payload, sig: await hmacHex(env.ADMIN_CHAT_TOKEN, payload) } }
export async function verifyAction(env: any, payload: string, sig: string) {
  if (!env.ADMIN_CHAT_TOKEN || !timingSafeEqual(await hmacHex(env.ADMIN_CHAT_TOKEN, payload), sig || '')) return null
  const p = JSON.parse(payload); return p.exp > Date.now() ? p as { tool: string, args: any } : null
}

export function systemPrompt(admin: boolean, files: { name: string }[], web_search: boolean, user?: { login: string, name: string | null } | null) {
  const list = toolsFor(admin, !!user).map(t => `- ${t.name}: ${t.description}`).join('\n')
  return `You are the aibotq.dev assistant. Help users ship AI agents: importing repos, configuring builds, env vars, deploys and custom domains. Be concise. Reply in the user's language.

You HAVE these tools and should call them instead of guessing:
${list}
${web_search ? '' : '\nThere is no web search tool. If the user needs a search, say so and offer to fetch a specific URL with web_fetch instead.'}
Rules: when the user mentions a URL or a docs page, use web_fetch. For anything about the current date/time, use current_time. For their projects/deploys, use list_projects or deploy_status. ${files.length ? `The user attached: ${files.map(f => f.name).join(', ')} — use read_uploaded_file to read them.` : ''}
${admin ? 'The current user is the verified site OWNER. You may read the website repo and propose changes. Write tools (propose_change, trigger_deploy) do not execute immediately: they create a pending action the owner must confirm in the UI. Never claim a change was made until a tool result confirms it. Never merge to main.' : 'Repository/admin tools are not available to this user.'}
${user ? `The user is signed in with GitHub as @${user.login}${user.name ? ` (${user.name})` : ''}. Address them accordingly.` : 'The user is not signed in. If they need account features, suggest "Sign in with GitHub" in the header.'}
${user ? 'You have a real Linux sandbox (run_code, run_command, write_file, read_file). Use it to actually run code, compute, test or convert things instead of guessing, and report the real output.' + (admin ? ' As owner the sandbox has internet access and up to 120 s per run.' : ' It has no internet access and a 30 s limit per run.') : 'Code-running sandbox tools are available only after signing in with GitHub.'}
${user ? 'For pulling structured values out of text or images (totals, dates, amounts, lists, estimates), call extract_data. When a returned value has uncertain=true, say clearly it is uncertain and show its confidence/p_null or p10-p90 range; never present it as certain.' : ''}
Never invent tool results.`
}
