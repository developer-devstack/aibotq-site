// Owner = signed-in GitHub account thanabartbb (session), or the ADMIN_CHAT_TOKEN fallback.
import { isAdmin } from './tools'
import type { H3Event } from 'h3'
export const OWNER_LOGIN = 'thanabartbb'
export async function chatIdentity(event: H3Event) {
  const env = (event.context as any).cloudflare?.env || {}
  const s = await getUserSession(event).catch(() => ({} as any))
  const user = (s as any)?.user ? { login: (s as any).user.login as string, name: (s as any).user.name as string | null } : null
  const owner = user?.login?.toLowerCase() === OWNER_LOGIN
  const admin = owner || await isAdmin(env, getHeader(event, 'x-admin-token'))
  return { env, user, admin, via: owner ? 'github' : admin ? 'token' : null }
}
