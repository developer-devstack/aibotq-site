// Aibotq.dev — server-rendered Nuxt app (Nuxt UI v4 + Tailwind v4) targeting Cloudflare Workers.
export default defineNuxtConfig({
  compatibilityDate: '2026-05-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  colorMode: { preference: 'dark', fallback: 'dark' },
  // Upright weights only — never fetch an italic face.
  fonts: { defaults: { weights: [400, 500, 600, 700, 800], styles: ['normal'] } },
  // Icons are bundled into the server build so nothing is fetched from the Iconify API at runtime.
  icon: { serverBundle: { collections: ['lucide', 'simple-icons'] }, clientBundle: { scan: true } },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      charset: 'utf-8',
      viewport: 'width=device-width,initial-scale=1',
      meta: [{ name: 'theme-color', content: '#09090b' }],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: { deployConfig: false, nodeCompat: true },
  },
})
