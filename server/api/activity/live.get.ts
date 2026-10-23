// GET /api/activity/live — owner-only aggregate snapshot for the live dashboard.
import { chatIdentity } from '../../utils/owner'
export default defineEventHandler(async (event) => {
  const { env, admin } = await chatIdentity(event)
  if (!admin) { setResponseStatus(event, 403); return { ok: false, error: 'Owner only. Sign in with an owner GitHub account.' } }
  if (!env.DB) { setResponseStatus(event, 500); return { ok: false, error: 'D1 binding DB missing' } }
  const now = Date.now(), q = (s: string, ...a: any[]) => env.DB.prepare(s).bind(...a)
  const [active, pages, recent, topics, totals, series] = await env.DB.batch([
    q('SELECT COUNT(DISTINCT vid) AS n FROM activity_events WHERE ts > ?', now - 5 * 60e3),
    q("SELECT path, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM activity_events WHERE type='pageview' AND ts > ? GROUP BY path ORDER BY views DESC LIMIT 8", now - 3600e3),
    q('SELECT ts, substr(vid,1,6) AS vid, type, path, target, topic, country FROM activity_events ORDER BY ts DESC LIMIT 25'),
    q("SELECT topic, COUNT(*) AS n FROM activity_events WHERE type='topic' AND ts > ? GROUP BY topic ORDER BY n DESC LIMIT 8", now - 864e5),
    q('SELECT COUNT(*) AS events, COUNT(DISTINCT vid) AS visitors FROM activity_events WHERE ts > ?', now - 864e5),
    q('SELECT (ts / 60000) AS m, COUNT(*) AS n FROM activity_events WHERE ts > ? GROUP BY m ORDER BY m', now - 30 * 60e3),
  ])
  return { ok: true, data: { now, active: (active.results[0] as any)?.n || 0, totals: totals.results[0], pages: pages.results, recent: recent.results, topics: topics.results, series: series.results } }
})
