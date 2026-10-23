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

import { toolsFor, signAction, systemPrompt, type ToolCtx } from './tools'
export type ToolEvent = { tool: string, input: any, output?: any, error?: string, pending?: { payload: string, sig: string } }
const MAX_STEPS = 5

// Agent loop: model -> tool calls -> execute -> results -> model (max MAX_STEPS). Same loop for both API kinds.
async function call(p: Provider, key: string, model: string, messages: ChatMsg[], tc: ToolCtx, events: ToolEvent[]): Promise<string> {
  const tools = toolsFor(tc.admin)
  const system = systemPrompt(tc.admin, tc.files, false, tc.user)
  const conv: any[] = p.kind === 'anthropic' ? [...messages] : [{ role: 'system', content: system }, ...messages]
  for (let step = 0; step <= MAX_STEPS; step++) {
    const useTools = step < MAX_STEPS
    let res: Response
    if (p.kind === 'anthropic') {
      res = await fetch(`${p.baseUrl}/v1/messages`, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2048, system, messages: conv, ...(useTools ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.schema })) } : {}) }) })
    } else {
      res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_completion_tokens: 2048, messages: conv, ...(useTools ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })) } : {}) }) })
    }
    const j: any = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`${p.label} ${model}: HTTP ${res.status}${j?.error?.message ? ' ' + j.error.message : ''}`)
    let calls: { id: string, name: string, input: any }[]
    let text: string
    if (p.kind === 'anthropic') {
      text = (j?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
      calls = (j?.content || []).filter((c: any) => c.type === 'tool_use').map((c: any) => ({ id: c.id, name: c.name, input: c.input }))
      if (calls.length) conv.push({ role: 'assistant', content: j.content })
    } else {
      const m = j?.choices?.[0]?.message || {}
      text = m.content || ''
      calls = (m.tool_calls || []).map((c: any) => { let input = {}; try { input = JSON.parse(c.function.arguments || '{}') } catch {} return { id: c.id, name: c.function.name, input } })
      if (calls.length) conv.push({ role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls })
    }
    if (!calls.length) { if (!text) throw new Error(`${p.label} ${model}: empty response`); return text }
    const results: { id: string, out: string }[] = []
    for (const c of calls) {
      const t = tools.find(x => x.name === c.name)
      const ev: ToolEvent = { tool: c.name, input: c.input }
      let out: any
      try {
        if (!t) out = { error: `Unknown or unavailable tool ${c.name}` }
        else if (t.write) { ev.pending = await signAction(tc.env, t.name, c.input); out = { status: 'pending_owner_confirmation', note: 'Shown to the owner with a Confirm button. It has NOT run yet.' } }
        else out = await t.run(c.input || {}, tc)
      } catch (e: any) { out = { error: e?.message || 'tool failed' } }
      if (out?.error) ev.error = out.error; else ev.output = typeof out === 'object' ? summarize(out) : out
      events.push(ev)
      results.push({ id: c.id, out: JSON.stringify(out).slice(0, 30000) })
    }
    if (p.kind === 'anthropic') conv.push({ role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.out })) })
    else for (const r of results) conv.push({ role: 'tool', tool_call_id: r.id, content: r.out })
  }
  throw new Error(`${p.label} ${model}: too many tool steps`)
}
function summarize(o: any) { const s = JSON.stringify(o); return s.length > 600 ? s.slice(0, 600) + '…' : s }

// Tries the requested model, then falls back to the first model of each other enabled provider.
export async function chat(env: any, requested: string | undefined, messages: ChatMsg[], tc: ToolCtx) {
  const { providers, models } = catalog(env)
  if (!models.length) return { ok: false as const, status: 501, error: 'Chat is not set up: no AI provider key is configured on this server.' }
  const first = models.find(m => m.id === requested) || models.find(m => m.id === env.CHAT_MODEL) || models[0]!
  const order = [first, ...providers.filter(p => p.id !== first.provider).map(p => models.find(m => m.provider === p.id)).filter(Boolean) as ModelDef[]]
  const errors: string[] = []
  for (const m of order) {
    const p = providers.find(x => x.id === m.provider)!
    const events: ToolEvent[] = []
    try { return { ok: true as const, text: await call(p, env[p.keyVar], m.id, messages, tc, events), model: m.id, provider: p.id, fallback: m !== first, errors, tools: events } }
    catch (e: any) { errors.push(e.message) }
  }
  return { ok: false as const, status: 502, error: 'All providers failed: ' + errors.join(' | ') }
}
