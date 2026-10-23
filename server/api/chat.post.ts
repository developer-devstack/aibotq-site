// POST /api/chat — minimal agent chat backed by Anthropic when ANTHROPIC_API_KEY is set as a Worker secret.
// Without the secret it returns an honest 501; nothing is simulated.
export default defineEventHandler(async (event) => {
  const env = (event.context as any).cloudflare?.env || {}
  const key = env.ANTHROPIC_API_KEY
  if (!key) { setResponseStatus(event, 501); return { ok: false, code: 'chat_not_configured', error: 'Agent chat is not set up on this server yet: the ANTHROPIC_API_KEY secret is missing.' } }
  const body = await readBody<{ messages?: { role: string, content: string }[] }>(event).catch(() => null)
  const messages = (body?.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }))
  if (!messages.length || messages[messages.length - 1]!.role !== 'user') { setResponseStatus(event, 400); return { ok: false, error: 'Send at least one user message.' } }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.CHAT_MODEL || 'claude-haiku-4-5', max_tokens: 1024, system: 'You are the aibotq.dev assistant. Help users ship AI agents: importing repos, configuring builds, env vars, deploys and custom domains. Be concise.', messages }),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok) { setResponseStatus(event, 502); return { ok: false, error: `Model request failed (HTTP ${res.status})${j?.error?.message ? ': ' + j.error.message : ''}` } }
  return { ok: true, data: { text: (j?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') } }
})
