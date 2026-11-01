// GET /auth/github — GitHub OAuth. Upserts user in D1; sealed session + legacy aq_session.
//
// Token + profile exchange uses cloudflare:sockets instead of fetch(). Workers on the
// aibotq.dev custom domain currently get Cloudflare 525 on fetch() to github.com /
// api.github.com (post-quantum TLS egress — workerd#7042). connect() still succeeds.
import { getCookie, getQuery, setCookie, deleteCookie, appendResponseHeader, getRequestURL, sendRedirect } from 'h3'
import { withQuery } from 'ufo'
import { randomToken, sha256Hex, cookie } from '../../lib/lib'
import { saveToken } from '../../lib/providers'
import { githubAccessToken, githubUser } from '../../utils/github-https'

const AUTHORIZE = 'https://github.com/login/oauth/authorize'
const STATE_COOKIE = 'nuxt-auth-state'
const OAUTH_COOKIE_MAX_AGE = 60 * 10

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fail(event: any, message: string) {
  console.error('GitHub OAuth error', message)
  return sendRedirect(event, '/?auth_error=' + encodeURIComponent('GitHub sign-in failed'))
}

export default defineEventHandler(async (event) => {
  try {
    const env = (event.context as any).cloudflare?.env || {}
    const runtime = useRuntimeConfig(event)
    const clientId = runtime.oauth?.github?.clientId || env.NUXT_OAUTH_GITHUB_CLIENT_ID || env.GITHUB_CLIENT_ID
    const clientSecret = runtime.oauth?.github?.clientSecret || env.NUXT_OAUTH_GITHUB_CLIENT_SECRET || env.GITHUB_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return fail(event, 'Missing NUXT_OAUTH_GITHUB_CLIENT_ID/SECRET')
    }

    const query = getQuery(event)
    if (query.error) return fail(event, `GitHub login failed: ${query.error}`)

    const requestURL = getRequestURL(event)
    const redirectURL = `${requestURL.protocol}//${requestURL.host}${requestURL.pathname}`

    if (!query.code) {
      const state = b64url(crypto.getRandomValues(new Uint8Array(32)))
      setCookie(event, STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: OAUTH_COOKIE_MAX_AGE,
        path: '/',
      })
      return sendRedirect(
        event,
        withQuery(AUTHORIZE, {
          client_id: clientId,
          redirect_uri: redirectURL,
          scope: 'read:user repo',
          state,
        }),
      )
    }

    const stateCookie = getCookie(event, STATE_COOKIE)
    deleteCookie(event, STATE_COOKIE, { path: '/' })
    if (!stateCookie || query.state !== stateCookie) {
      return fail(event, 'GitHub login failed: state mismatch')
    }

    const tokens = await githubAccessToken({
      clientId: String(clientId),
      clientSecret: String(clientSecret),
      code: String(query.code),
      redirectUri: redirectURL,
    })
    if (tokens?.error || !tokens?.access_token) {
      return fail(event, `GitHub login failed: ${tokens?.error_description || tokens?.error || 'no access_token'}`)
    }

    const gh = await githubUser(String(tokens.access_token), String(clientId))
    if (!gh?.id) return fail(event, 'GitHub login failed: no user profile')

    const ghId = String(gh.id), login = String(gh.login), name = gh.name || null, avatar = gh.avatar_url || null
    const found = await env.DB.prepare('SELECT id FROM users WHERE github_id = ?').bind(ghId).first()
    const userId: string = found?.id || crypto.randomUUID()
    if (found) await env.DB.prepare('UPDATE users SET login = ?, name = ?, avatar = ? WHERE id = ?').bind(login, name, avatar, userId).run()
    else await env.DB.prepare('INSERT INTO users (id, github_id, login, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, ghId, login, name, avatar, Date.now()).run()
    if (env.SESSION_SECRET && tokens.access_token) await saveToken(env, userId, 'github', { access: tokens.access_token }).catch(() => {})
    const st = randomToken(32)
    await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(st), userId, Date.now() + 30 * 864e5).run()
    appendResponseHeader(event, 'set-cookie', cookie(getRequestURL(event), 'aq_session', st, 30 * 86400))
    await setUserSession(event, { user: { id: userId, githubId: ghId, login, name, avatar } }, { maxAge: 30 * 86400 })
    return sendRedirect(event, '/dashboard/')
  } catch (error: any) {
    return fail(event, error?.message || String(error))
  }
})
