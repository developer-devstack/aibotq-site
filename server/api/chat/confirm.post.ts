// POST /api/chat/confirm — owner clicked Confirm on a pending write action. Requires admin token + valid HMAC signature.
import { chatIdentity } from '../../utils/owner'
import { verifyAction, TOOLS } from '../../utils/tools'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  if (!(await chatIdentity(event)).admin) { setResponseStatus(event, 403); return { ok: false, error: 'Owner token required.' } }
  const b = await readBody<{ payload: string, sig: string }>(event).catch(() => null)
  const a = b && await verifyAction(env, b.payload, b.sig).catch(() => null)
  const t = a && TOOLS.find(x => x.name === a.tool && x.write)
  if (!a || !t) { setResponseStatus(event, 400); return { ok: false, error: 'Invalid or expired action.' } }
  try { return { ok: true, data: await t.run(a.args, { env, req: toWebRequest(event), admin: true, files: [] }) } }
  catch (e: any) { setResponseStatus(event, 502); return { ok: false, error: e.message } }
})
