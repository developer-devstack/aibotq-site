# aibotq-site

Static marketing site for Aibotq.dev (Home + /new). Deployed as a Cloudflare Worker with static assets on aibotq.dev.

```
npx wrangler deploy
```

## Nuxt (feat/nuxt)
Server-rendered Nuxt 4 app (`app/`), Nitro preset `cloudflare_module`. API: `server/api/[...path].ts` -> `server/lib` router.
- Install: `npm install` · Build: `npm run build` (nuxt build) · Output: `.output` (worker `.output/server/index.mjs`, assets `.output/public`)
- Local: `npm run preview` (wrangler dev) · Deploy: `npm run deploy` (wrangler, needs GO)
