// DELETE /api/activity/me — erase every event for the aq_vid cookie (used by Opt out).
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const v = getCookie(event, 'aq_vid') || ''
  if (!/^[a-z0-9]{16,40}$/i.test(v) || !env.DB) return { ok: true, data: { deleted: 0 } }
  const r = await env.DB.prepare('DELETE FROM activity_events WHERE vid = ?').bind(v).run()
  deleteCookie(event, 'aq_vid', { path: '/' })
  return { ok: true, data: { deleted: r.meta?.changes ?? 0 } }
})
