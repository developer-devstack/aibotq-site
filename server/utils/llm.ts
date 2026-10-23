// Provider-agnostic chat. Add providers here: Anthropic native API, or any OpenAI-compatible API (base URL + key secret).
export type ChatMsg = { role: 'user' | 'assistant', content: string }
export type Provider = { id: string, label: string, kind: 'anthropic' | 'openai', baseUrl: string, keyVar: string }
export type ModelDef = { id: string, label: string, provider: string }

export const PROVIDERS: Provider[] = [
  { id: 'anthropic', label: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', keyVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', keyVar: 'OPENAI_API_KEY' },
]
export const DEFAULT_MODELS: ModelDef[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku', provider: 'anthropic' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet', provider: 'anthropic' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', provider: 'openai' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'openai' },
]

// Extra providers/models via env JSON: EXTRA_PROVIDERS=[{id,label,kind:'openai',baseUrl,keyVar}], EXTRA_MODELS=[{id,label,provider}]
function parse<T>(v: any): T[] { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v) } catch { return [] } }
export function catalog(env: any) {
  const providers = [...PROVIDERS, ...parse<Provider>(env.EXTRA_PROVIDERS)]
  const enabled = providers.filter(p => !!env[p.keyVar])
  const models = [...DEFAULT_MODELS, ...parse<ModelDef>(env.EXTRA_MODELS)].filter(m => enabled.some(p => p.id === m.provider))
  return { providers: enabled, models }
}

const SYSTEM = 'You are the aibotq.dev assistant. Help users ship AI agents: importing repos, configuring builds, env vars, deploys and custom domains. Be concise. Reply in the user\'s language.'

async function call(p: Provider, key: string, model: string, messages: ChatMsg[]): Promise<string> {
  let res: Response
  if (p.kind === 'anthropic') {
    res = await fetch(`${p.baseUrl}/v1/messages`, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages }) })
  } else {
    res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_completion_tokens: 2048, messages: [{ role: 'system', content: SYSTEM }, ...messages] }) })
  }
  const j: any = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${p.label} ${model}: HTTP ${res.status}${j?.error?.message ? ' ' + j.error.message : ''}`)
  const text = p.kind === 'anthropic' ? (j?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : (j?.choices?.[0]?.message?.content || '')
  if (!text) throw new Error(`${p.label} ${model}: empty response`)
  return text
}

// Tries the requested model, then falls back to the first model of each other enabled provider.
export async function chat(env: any, requested: string | undefined, messages: ChatMsg[]) {
  const { providers, models } = catalog(env)
  if (!models.length) return { ok: false as const, status: 501, error: 'Chat is not set up: no AI provider key is configured on this server.' }
  const first = models.find(m => m.id === requested) || models.find(m => m.id === env.CHAT_MODEL) || models[0]!
  const order = [first, ...providers.filter(p => p.id !== first.provider).map(p => models.find(m => m.provider === p.id)).filter(Boolean) as ModelDef[]]
  const errors: string[] = []
  for (const m of order) {
    const p = providers.find(x => x.id === m.provider)!
    try { return { ok: true as const, text: await call(p, env[p.keyVar], m.id, messages), model: m.id, provider: p.id, fallback: m !== first, errors } }
    catch (e: any) { errors.push(e.message) }
  }
  return { ok: false as const, status: 502, error: 'All providers failed: ' + errors.join(' | ') }
}
