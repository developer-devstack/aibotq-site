// POST /api/chat — provider-agnostic chat (see server/utils/llm.ts). Honest errors; nothing simulated.
import { chat } from '../utils/llm'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const body = await readBody<{ model?: string, messages?: { role: string, content: string }[] }>(event).catch(() => null)
  const messages = (body?.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-20)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 8000) }))
  if (!messages.length || messages[messages.length - 1]!.role !== 'user') { setResponseStatus(event, 400); return { ok: false, error: 'Send at least one user message.' } }
  const r = await chat(env, body?.model, messages)
  if (!r.ok) { setResponseStatus(event, r.status); return { ok: false, code: r.status === 501 ? 'chat_not_configured' : 'model_error', error: r.error } }
  return { ok: true, data: { text: r.text, model: r.model, provider: r.provider, fallback: r.fallback } }
})
