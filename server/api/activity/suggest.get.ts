// GET /api/activity/suggest — suggestions for *this* visitor from their own recent events (last 7 days, max 100).
import { visitor, CATALOG, pathInterest } from '../../utils/activity'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const vid = visitor(event)
  if (!vid || !env.DB) return { ok: true, data: { personalized: false, interests: [], items: CATALOG.start } }
  const { results } = await env.DB.prepare('SELECT type, path, target, topic, ts FROM activity_events WHERE vid = ? AND ts > ? ORDER BY ts DESC LIMIT 100').bind(vid, Date.now() - 7 * 864e5).all()
  const score: Record<string, number> = {}
  for (const [i, r] of (results as any[]).entries()) {
    const w = 1 / (1 + i / 10) * (r.type === 'topic' ? 3 : r.type === 'click' ? 2 : 1)
    const k = r.type === 'topic' ? r.topic : pathInterest(r.path || '', r.target)
    if (k && CATALOG[k]) score[k] = (score[k] || 0) + w
  }
  const interests = Object.entries(score).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3)
  if (!interests.length) return { ok: true, data: { personalized: false, interests: [], items: CATALOG.start } }
  const seen = new Set<string>(), items: any[] = []
  for (const k of interests) for (const it of CATALOG[k]!) if (!seen.has(it.title) && items.length < 6) { seen.add(it.title); items.push({ ...it, reason: k }) }
  return { ok: true, data: { personalized: true, interests, items } }
})
