// GET /auth/github — GitHub OAuth via nuxt-auth-utils. Upserts the user in D1, stores the session (sealed cookie)
// and also issues the legacy aq_session row so /api/me, dashboard and imports keep working.
import { randomToken, sha256Hex, cookie } from '../../lib/lib'
import { saveToken } from '../../lib/providers'
export default defineOAuthGitHubEventHandler({
  config: { scope: ['read:user', 'repo'] },
  async onSuccess(event, { user: gh, tokens }) {
    const env = (event.context as any).cloudflare?.env || {}
    const ghId = String(gh.id), login = String(gh.login), name = gh.name || null, avatar = gh.avatar_url || null
    const found = await env.DB.prepare('SELECT id FROM users WHERE github_id = ?').bind(ghId).first()
    const userId: string = found?.id || crypto.randomUUID()
    if (found) await env.DB.prepare('UPDATE users SET login = ?, name = ?, avatar = ? WHERE id = ?').bind(login, name, avatar, userId).run()
    else await env.DB.prepare('INSERT INTO users (id, github_id, login, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, ghId, login, name, avatar, Date.now()).run()
    if (env.SESSION_SECRET && tokens?.access_token) await saveToken(env, userId, 'github', { access: tokens.access_token }).catch(() => {})
    const st = randomToken(32)
    await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(st), userId, Date.now() + 30 * 864e5).run()
    appendResponseHeader(event, 'set-cookie', cookie(getRequestURL(event), 'aq_session', st, 30 * 86400))
    await setUserSession(event, { user: { id: userId, githubId: ghId, login, name, avatar } }, { maxAge: 30 * 86400 })
    return sendRedirect(event, '/dashboard/')
  },
  onError(event, error) {
    console.error('GitHub OAuth error', error?.message)
    return sendRedirect(event, '/?auth_error=' + encodeURIComponent('GitHub sign-in failed'))
  },
})
