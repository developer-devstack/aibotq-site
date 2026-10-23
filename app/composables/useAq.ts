// Thin client for the Aibotq JSON API (/api/*). Every failure surfaces its real message.
export class ApiErr extends Error {
  constructor(message: string, public status = 0, public code?: string, public extra: any = {}) { super(message) }
}
export async function aq<T = any>(path: string, opts: { method?: string, body?: any, form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} }
  if (opts.form) init.body = opts.form
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); (init.headers as any)['content-type'] = 'application/json' }
  let res: Response, json: any
  try { res = await fetch('/api' + path, init) } catch { throw new ApiErr('Cannot reach the Aibotq API — check your connection and try again.', 0, 'network') }
  try { json = await res.json() } catch { throw new ApiErr(`The API returned an unexpected response (HTTP ${res.status}).`, res.status, 'bad_response') }
  if (!json || json.ok !== true) throw new ApiErr(json?.error || `Request failed (HTTP ${res.status})`, res.status, json?.code, json)
  return json.data
}
export const LABEL: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' }
export const FW: Record<string, string> = { nextjs: 'Next.js', nuxt: 'Nuxt', astro: 'Astro', sveltekit: 'SvelteKit', remix: 'Remix', vite: 'Vite', cra: 'Create React App', node: 'Node.js', static: 'Static site', other: 'Other' }
export function safeUrl(u?: string) { try { const x = new URL(u || ''); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '' } catch { return '' } }
export function timeAgo(ts: any) {
  const t = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts); if (!t) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`
}
/** Session + server config, shared across components. */
export function useSession() {
  const user = useState<any>('aq-user', () => null)
  const cfg = useState<any>('aq-cfg', () => null)
  const loaded = useState('aq-loaded', () => false)
  const error = useState<string>('aq-err', () => '')
  async function load(fresh = false) {
    if (loaded.value && !fresh) return
    const [c, u] = await Promise.all([aq('/config').catch((e) => { error.value = e.message; return null }), aq('/me').then(d => d.user).catch(() => null)])
    cfg.value = c; user.value = u; loaded.value = true
  }
  const toast = useToast()
  function login(_provider = 'github', _mode = 'login', _next = '/dashboard/') {
    location.href = '/auth/github'
  }
  async function logout() {
    try { await aq('/auth/logout', { method: 'POST', body: {} }); await fetch('/api/_auth/session', { method: 'DELETE', credentials: 'same-origin' }) } catch (e: any) { toast.add({ color: 'error', title: e.message }); return }
    location.href = '/'
  }
  return { user, cfg, loaded, error, load, login, logout }
}
