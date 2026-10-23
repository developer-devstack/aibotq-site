// Clairic (@cf/cloudflare/clairic, Workers AI preview): typed extraction with confidence / p_null / p10-p90.
// Privacy: inputs (state, images) are never logged; only field count, sizes and status.
const TYPES = ['text', 'number', 'date', 'time', 'datetime', 'duration', 'list', 'estimate', 'forecast']
export const LOW_CONFIDENCE = 0.8
export const HIGH_P_NULL = 0.5

const b64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }

export async function loadImage(src: string): Promise<string> {
  if (src.startsWith('data:')) { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(src); if (!m) throw new Error('Only PNG, JPEG or WebP images are supported'); return `data:image/${m[1]!.toLowerCase().replace('jpg', 'jpeg')};base64,${m[2]}` }
  const u = new URL(src); if (u.protocol !== 'https:') throw new Error('Image URLs must be https')
  const r = await fetch(u, { redirect: 'follow', headers: { accept: 'image/png,image/jpeg,image/webp' } })
  if (!r.ok) throw new Error(`Image fetch failed: HTTP ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (!/image\/(png|jpe?g|webp)/i.test(ct)) throw new Error(`Unsupported image type ${ct || 'unknown'} (PNG, JPEG or WebP only)`)
  const buf = await r.arrayBuffer(); if (buf.byteLength > 4 * 1024 * 1024) throw new Error('Image larger than 4 MiB')
  const mime = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpeg'
  return `data:image/${mime};base64,${b64(buf)}` // Clairic requires embedded data URIs (raw base64 is rejected)
}

export function cleanFields(fields: any) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object: { name: { type, instructions?, ... } }')
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields).slice(0, 40)) {
    const f: any = typeof v === 'string' ? { type: v } : { ...(v as any) }
    if (!TYPES.includes(f.type)) throw new Error(`Field "${k}" has unsupported type "${f.type}". Use one of: ${TYPES.join(', ')}`)
    out[k.slice(0, 64)] = f
  }
  if (!Object.keys(out).length) throw new Error('Give at least one field')
  return out
}

export function annotate(answers: Record<string, any>) {
  const res: Record<string, any> = {}
  for (const [k, a] of Object.entries(answers || {})) {
    const conf = typeof a?.confidence === 'number' ? a.confidence : null
    const pn = typeof a?.p_null === 'number' ? a.p_null : null
    const width = typeof a?.p10 === 'number' && typeof a?.p90 === 'number' ? a.p90 - a.p10 : null
    const uncertain = (conf !== null && conf < LOW_CONFIDENCE) || (pn !== null && pn > HIGH_P_NULL) || a?.value === null
    res[k] = { type: a?.type, value: a?.value ?? null, confidence: conf, p_null: pn, ...(a?.p10 !== undefined ? { median: a.median, p10: a.p10, p90: a.p90 } : {}), ...(a?.guess !== undefined && a?.value === null ? { best_guess: a.guess } : {}), ...(a?.span ? { span: a.span } : {}), ...(a?.values ? { values: a.values } : {}), uncertain, ...(width !== null ? { interval_width: width } : {}) }
  }
  return res
}

export async function runClairic(env: any, input: { state?: string, images?: string[], fields: any }) {
  if (!env.AI) throw new Error('Workers AI binding (AI) is not configured on this server.')
  const fields = cleanFields(input.fields)
  const state = String(input.state || '').slice(0, 200_000)
  const images = await Promise.all((input.images || []).slice(0, 4).map(loadImage))
  if (!state && !images.length) throw new Error('Nothing to read: give state text or at least one image.')
  const reference_date = new Date().toISOString().slice(0, 10)
  const body: any = { model: 'clairic', state, fields, reference_date }
  if (images.length) body.images = images
  const t = Date.now()
  try {
    const r: any = await env.AI.run('@cf/cloudflare/clairic', body)
    console.log(JSON.stringify({ tool: 'extract_data', ok: true, fields: Object.keys(fields).length, state_chars: state.length, images: images.length, ms: Date.now() - t }))
    return { reference_date, answers: annotate(r?.answers), truncated: r?.truncated, usage: r?.usage, note: `Values with uncertain=true (confidence < ${LOW_CONFIDENCE}, p_null > ${HIGH_P_NULL}, or null) must be shown to the user as uncertain.` }
  } catch (e: any) {
    console.log(JSON.stringify({ tool: 'extract_data', ok: false, fields: Object.keys(fields).length, state_chars: state.length, images: images.length, ms: Date.now() - t }))
    throw new Error('Clairic error: ' + String(e?.message || e).slice(0, 500))
  }
}
