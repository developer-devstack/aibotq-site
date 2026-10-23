// Aibotq.dev — server-rendered Nuxt app targeting Cloudflare Workers.
export default defineNuxtConfig({
  compatibilityDate: '2026-05-01',
  devtools: { enabled: false },
  app: {
    head: {
      htmlAttrs: { lang: 'en', 'data-theme': 'dark' },
      charset: 'utf-8',
      viewport: 'width=device-width,initial-scale=1',
      titleTemplate: '%s',
      meta: [{ name: 'theme-color', content: '#000000' }],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        // Upright weights only — no italic axis is requested.
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap' },
        { rel: 'stylesheet', href: '/style.css' },
      ],
      style: [{ innerHTML: '*,*::before,*::after{font-style:normal!important;font-synthesis:none}' }],
    },
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: { deployConfig: false, nodeCompat: true },
  },
})
