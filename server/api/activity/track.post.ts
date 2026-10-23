// POST /api/activity/track — consented first-party events only. Returns { recorded: false } when not consented/opted out.
import { record, cleanPath, CTAS } from '../../utils/activity'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const b = await readBody<any>(event).catch(() => null)
  const type = b?.type
  if (type !== 'pageview' && type !== 'click') { setResponseStatus(event, 400); return { ok: false, error: 'type must be pageview or click' } }
  const target = type === 'click' ? String(b?.target || '') : null
  if (type === 'click' && !CTAS.has(target!)) { setResponseStatus(event, 400); return { ok: false, error: 'unknown target' } }
  const recorded = await record(env, event, { type, path: cleanPath(b?.path), target })
  return { ok: true, data: { recorded } }
})
