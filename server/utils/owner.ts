// Owner = signed-in GitHub login listed in OWNER_GITHUB_LOGINS (comma-separated, case-insensitive), or the ADMIN_CHAT_TOKEN fallback.
import { isAdmin } from './tools'
import type { H3Event } from 'h3'
const DEFAULT_OWNERS = 'thanabartbb,examplessdk-lgtm'
export const ownerLogins = (env: any) => String(env.OWNER_GITHUB_LOGINS || DEFAULT_OWNERS).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
export async function chatIdentity(event: H3Event) {
  const env = (event.context as any).cloudflare?.env || {}
  const s = await getUserSession(event).catch(() => ({} as any))
  const user = (s as any)?.user ? { login: (s as any).user.login as string, name: (s as any).user.name as string | null } : null
  const owner = !!user?.login && ownerLogins(env).includes(user.login.toLowerCase())
  const admin = owner || await isAdmin(env, getHeader(event, 'x-admin-token'))
  return { env, user, admin, via: owner ? 'github' : admin ? 'token' : null }
}
