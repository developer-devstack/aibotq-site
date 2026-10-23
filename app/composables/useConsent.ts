// Consent state for first-party activity tracking. Default = not tracked until the visitor accepts.
export function useConsent() {
  const state = useState<'unknown' | 'yes' | 'no'>('aq-consent', () => 'unknown')
  function read() {
    if (import.meta.server) return
    const m = document.cookie.match(/(?:^|; )aq_consent=([01])/)
    state.value = m ? (m[1] === '1' ? 'yes' : 'no') : 'unknown'
  }
  function set(v: boolean) {
    const year = 60 * 60 * 24 * 365
    document.cookie = `aq_consent=${v ? 1 : 0}; Path=/; Max-Age=${year}; SameSite=Lax; Secure`
    if (v) {
      if (!/(?:^|; )aq_vid=/.test(document.cookie)) {
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('')
        document.cookie = `aq_vid=${id}; Path=/; Max-Age=${year}; SameSite=Lax; Secure`
      }
    } else {
      // Opt-out also erases this visitor's stored events server-side.
      fetch('/api/activity/me', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}).finally(() => { document.cookie = 'aq_vid=; Path=/; Max-Age=0; SameSite=Lax; Secure' })
    }
    state.value = v ? 'yes' : 'no'
  }
  const gpc = () => import.meta.client && ((navigator as any).globalPrivacyControl === true || navigator.doNotTrack === '1')
  return { state, read, set, gpc }
}
export function track(type: 'pageview' | 'click', data: { path?: string, target?: string } = {}) {
  if (import.meta.server || !/(?:^|; )aq_consent=1/.test(document.cookie)) return
  const body = JSON.stringify({ type, path: data.path || location.pathname, target: data.target })
  fetch('/api/activity/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
}
