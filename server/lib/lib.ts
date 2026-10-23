import type { Ctx, Env } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const SEC_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function ok(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: { ...SEC_HEADERS, ...(headers as object) } });
}

export function fail(status: number, error: string, extra?: Record<string, unknown>, code?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, ...(code ? { code } : {}), ...extra }), { status, headers: SEC_HEADERS });
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'Request body too large');
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
}

// ---------- encoding ----------
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

// ---------- secrets ----------
export function requireSecret(env: Env, name: keyof Env): string {
  const v = env[name];
  if (typeof v !== 'string' || !v) throw new ApiError(503, `Server is not configured: ${String(name)} is missing`, 'not_configured');
  return v;
}

async function hkdf(secret: string, info: string, algo: Parameters<SubtleCrypto['deriveKey']>[2], usages: string[]) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('aibotq.dev/v1'), info: enc.encode(info) },
    base,
    algo,
    false,
    usages,
  );
}

export async function encrypt(env: Env, plaintext: string): Promise<string> {
  const key = await hkdf(requireSecret(env, 'SESSION_SECRET'), 'aes-gcm', { name: 'AES-GCM', length: 256 }, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return b64url(out);
}

export async function decrypt(env: Env, token: string): Promise<string> {
  const key = await hkdf(requireSecret(env, 'SESSION_SECRET'), 'aes-gcm', { name: 'AES-GCM', length: 256 }, ['decrypt']);
  const raw = b64urlDecode(token);
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12)));
  } catch {
    throw new ApiError(500, 'Stored secret could not be decrypted (SESSION_SECRET changed?)');
  }
}

// Signed (not encrypted) cookie payloads, e.g. the OAuth state.
export async function sign(env: Env, payload: object): Promise<string> {
  const key = await hkdf(requireSecret(env, 'SESSION_SECRET'), 'cookie-hmac', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${sig}`;
}

export async function unsign<T>(env: Env, value: string | undefined): Promise<T | null> {
  if (!value) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const key = await hkdf(requireSecret(env, 'SESSION_SECRET'), 'cookie-hmac', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
  const expect = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  if (!timingSafeEqual(sig, expect)) return null;
  try {
    return JSON.parse(dec.decode(b64urlDecode(body))) as T;
  } catch {
    return null;
  }
}

// HMAC with a raw shared secret (webhooks / build pipeline), hex-encoded.
export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// ---------- cookies ----------
export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

export function cookie(url: URL, name: string, value: string, maxAge: number): string {
  const secure = isLocalHttp(url) ? '' : '; Secure';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- request guards ----------
export function appOrigin(env: Env, url: URL): string {
  try {
    return env.APP_URL ? new URL(env.APP_URL).origin : url.origin;
  } catch {
    return url.origin;
  }
}

export function checkCsrf({ req, env, url }: Pick<Ctx, 'req' | 'env' | 'url'>): void {
  const origin = req.headers.get('origin');
  if (!origin || (origin !== url.origin && origin !== appOrigin(env, url))) {
    throw new ApiError(403, 'Cross-origin request blocked (bad or missing Origin header)', 'csrf');
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || 'local';
}

export async function rateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400).run();
  }
  if (row && row.count > limit) {
    throw new ApiError(429, `Too many requests — try again in ${windowStart + windowSec - now}s`, 'rate_limited');
  }
}

export function parseTemplates(env: Env): Record<string, string> {
  let t = env.TEMPLATES;
  if (typeof t === 'string') {
    try {
      t = JSON.parse(t);
    } catch {
      return {};
    }
  }
  const out: Record<string, string> = {};
  if (t && typeof t === 'object') {
    for (const [k, v] of Object.entries(t)) if (typeof v === 'string' && /^[\w.-]+\/[\w.-]+$/.test(v)) out[k] = v;
  }
  return out;
}
