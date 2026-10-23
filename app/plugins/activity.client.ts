// Page views on every route change + clicks on elements with data-track="<cta id>". Only sends after consent.
export default defineNuxtPlugin((nuxt) => {
  const router = useRouter()
  const { read } = useConsent()
  read()
  nuxt.hook('app:mounted', () => track('pageview'))
  router.afterEach((to, from) => { if (from.matched.length && to.path !== from.path) setTimeout(() => track('pageview', { path: to.path }), 0) })
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement)?.closest?.('[data-track]') as HTMLElement | null
    if (el) track('click', { target: el.dataset.track })
  }, { capture: true })
})
