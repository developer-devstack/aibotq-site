// GET /api/models — models whose provider key is configured.
import { catalog } from '../utils/llm'
export default defineEventHandler((event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const { providers, models } = catalog(env)
  return { ok: true, data: { default: models.find(m => m.id === env.CHAT_MODEL)?.id || models[0]?.id || null, providers: providers.map(p => ({ id: p.id, label: p.label })), models } }
})
