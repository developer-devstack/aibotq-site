// POST /api/chat/admin — check an owner token (server-side compare only; the token is never sent back).
import { chatIdentity } from '../../utils/owner'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const id = await chatIdentity(event)
  return { ok: true, data: { admin: id.admin && !!env.ADMIN_CHAT_TOKEN, via: id.via, user: id.user, configured: !!env.ADMIN_CHAT_TOKEN, github: !!env.GITHUB_ADMIN_TOKEN } }
})
