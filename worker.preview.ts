// Preview entry only — Nuxt/Nitro homepage UI. No Sandbox/containers.
// @ts-ignore built output
import nitro from './.output/server/index.mjs'
export default {
  async fetch(req: Request, env: any, ctx: ExecutionContext) {
    return nitro.fetch(req, env, ctx)
  },
}
