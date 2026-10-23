// POST /api/chat — provider-agnostic chat with tool calling (server/utils/llm.ts + tools.ts). Honest errors; nothing simulated.
import { chat } from '../utils/llm'
import { chatIdentity } from '../utils/owner'
import { extractText } from 'unpdf'
import { classify, record } from '../utils/activity'
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const body = await readBody<{ model?: string, messages?: { role: string, content: string }[], files?: { name: string, type?: string, text?: string, base64?: string }[] }>(event).catch(() => null)
  const messages = (body?.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-20)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 8000) }))
  if (!messages.length || messages[messages.length - 1]!.role !== 'user') { setResponseStatus(event, 400); return { ok: false, error: 'Send at least one user message.' } }
  const files: { name: string, text: string }[] = []
  const images: { name: string, dataUrl: string }[] = []
  for (const f of (body?.files || []).slice(0, 5)) {
    try {
      if (f.base64 && /^image\/(png|jpe?g|webp)$/i.test(f.type || '')) {
        if (f.base64.length > 5_600_000) throw new Error('Image too large (max 4 MiB)')
        if (images.length < 4) images.push({ name: String(f.name).slice(0, 200), dataUrl: `data:${f.type};base64,${f.base64}` })
      } else if (f.base64 && /pdf/i.test(f.type || f.name)) {
        if (f.base64.length > 6_000_000) throw new Error('PDF too large (max ~4 MB)')
        const { text } = await extractText(Uint8Array.from(atob(f.base64), c => c.charCodeAt(0)), { mergePages: true })
        files.push({ name: String(f.name).slice(0, 200), text: String(text) })
      } else if (typeof f.text === 'string') files.push({ name: String(f.name).slice(0, 200), text: f.text.slice(0, 200000) })
    } catch (e: any) { files.push({ name: String(f.name), text: `[Could not read file: ${e.message}]` }) }
  }
  const { admin, user } = await chatIdentity(event)
  // Topic categories only (never the message text); skipped unless the visitor consented.
  for (const topic of classify(messages[messages.length - 1]!.content)) await record(env, event, { type: 'topic', path: '/chat/', topic }).catch(() => {})
  const r = await chat(env, body?.model, messages, { env, req: toWebRequest(event), admin, files, images, user, lastUserMessage: messages[messages.length - 1]!.content })
  if (!r.ok) { setResponseStatus(event, r.status); return { ok: false, code: r.status === 501 ? 'chat_not_configured' : 'model_error', error: r.error } }
  return { ok: true, data: { text: r.text, model: r.model, provider: r.provider, fallback: r.fallback, tools: r.tools, admin, user } }
})
