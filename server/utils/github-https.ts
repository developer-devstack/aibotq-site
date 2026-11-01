/**
 * Minimal HTTPS request via cloudflare:sockets.
 * fetch() from a Worker on a custom domain can return CF 525 to github.com /
 * api.github.com (post-quantum TLS egress — workerd#7042). connect() is the workaround.
 */
import { connect } from 'cloudflare:sockets'

export async function httpsRequest(opts: {
  hostname: string
  path: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}): Promise<{ status: number, headers: Headers, body: string }> {
  const method = opts.method || 'GET'
  const body = opts.body || ''
  const timeoutMs = opts.timeoutMs || 15000
  const headers: Record<string, string> = {
    Host: opts.hostname,
    Connection: 'close',
    'User-Agent': 'aibotq-oauth',
    ...(opts.headers || {}),
  }
  if (body && !headers['Content-Length'] && !headers['content-length']) {
    headers['Content-Length'] = String(new TextEncoder().encode(body).byteLength)
  }

  const socket = connect(
    { hostname: opts.hostname, port: 443 },
    { secureTransport: 'on' },
  )

  try {
    await Promise.race([
      socket.opened,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`TLS open timeout to ${opts.hostname}`)), timeoutMs)),
    ])
  } catch (e: any) {
    try { socket.close() } catch { /* ignore */ }
    throw new Error(`Socket open failed to ${opts.hostname}: ${e?.message || e}`)
  }

  const encoder = new TextEncoder()
  let req = `${method} ${opts.path} HTTP/1.1\r\n`
  for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
  req += `\r\n${body}`

  // Write full request, then releaseLock (do NOT close writable — that can FIN before response).
  const writer = socket.writable.getWriter()
  await writer.write(encoder.encode(req))
  writer.releaseLock()

  const reader = socket.readable.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  const deadline = Date.now() + timeoutMs
  let readErr: any = null
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now())
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true, value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), remaining),
        ),
      ])
      if (result.done) {
        // Distinguish timeout vs remote close: if we timed out and have no headers, keep waiting until deadline once more?
        if (!raw.includes('\r\n\r\n') && Date.now() < deadline - 100) {
          // race resolved via timeout with done:true sentinel — continue loop
          // but reader.read() may still be pending; cancel race by continuing only if value undefined and we used timeout
          // Actually both timeout and real done look the same. Break only if real stream ended:
          // Re-check: if done from reader, stream ended. We can't tell. Break.
          break
        }
        break
      }
      if (result.value) raw += decoder.decode(result.value, { stream: true })
      if (raw.includes('\r\n\r\n')) {
        const headerEnd = raw.indexOf('\r\n\r\n')
        const headerText = raw.slice(0, headerEnd)
        const cl = /content-length:\s*(\d+)/i.exec(headerText)
        if (cl) {
          const need = Number(cl[1])
          const bodySoFar = raw.slice(headerEnd + 4)
          if (new TextEncoder().encode(bodySoFar).byteLength >= need) break
        } else if (/transfer-encoding:\s*chunked/i.test(headerText)) {
          if (raw.includes('\r\n0\r\n\r\n')) break
        }
      }
    }
  } catch (e) {
    readErr = e
  }
  try { await reader.cancel() } catch { /* ignore */ }
  try { socket.close() } catch { /* ignore */ }

  const headerEnd = raw.indexOf('\r\n\r\n')
  if (headerEnd < 0) {
    throw new Error(
      `No HTTP response from ${opts.hostname}` +
        (readErr ? ` (read: ${readErr?.message || readErr})` : '') +
        (raw ? ` partial=${JSON.stringify(raw.slice(0, 120))}` : ' empty'),
    )
  }
  const headerLines = raw.slice(0, headerEnd).split('\r\n')
  const status = Number(headerLines[0]?.split(' ')[1] || 0)
  const outHeaders = new Headers()
  for (const line of headerLines.slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) outHeaders.append(line.slice(0, i).trim(), line.slice(i + 1).trim())
  }
  let respBody = raw.slice(headerEnd + 4)
  if (/transfer-encoding:\s*chunked/i.test(raw.slice(0, headerEnd))) {
    respBody = decodeChunked(respBody)
  }
  return { status, headers: outHeaders, body: respBody }
}

function decodeChunked(input: string): string {
  let i = 0
  let out = ''
  while (i < input.length) {
    const lineEnd = input.indexOf('\r\n', i)
    if (lineEnd < 0) break
    const size = parseInt(input.slice(i, lineEnd), 16)
    if (!Number.isFinite(size) || size < 0) break
    i = lineEnd + 2
    if (size === 0) break
    out += input.slice(i, i + size)
    i += size + 2
  }
  return out
}

export async function githubAccessToken(params: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}): Promise<Record<string, any>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  }).toString()
  const res = await httpsRequest({
    hostname: 'github.com',
    path: '/login/oauth/access_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  try {
    return JSON.parse(res.body)
  } catch {
    return { error: 'invalid_response', error_description: `HTTP ${res.status}`, raw: res.body.slice(0, 200) }
  }
}

export async function githubUser(accessToken: string, clientId: string): Promise<any> {
  const res = await httpsRequest({
    hostname: 'api.github.com',
    path: '/user',
    method: 'GET',
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': `Github-OAuth-${clientId}`,
    },
  })
  if (res.status >= 400) throw new Error(`GitHub /user HTTP ${res.status}: ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body)
}
