// POST /api/chat/admin — check an owner token (server-side compare only; the token is never sent back).
import { isAdmin } from '../../utils/tools'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  if (!env.ADMIN_CHAT_TOKEN) return { ok: true, data: { admin: false, configured: false } }
  return { ok: true, data: { admin: await isAdmin(env, getHeader(event, 'x-admin-token')), configured: true, github: !!env.GITHUB_ADMIN_TOKEN } }
})
