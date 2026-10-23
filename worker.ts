// Worker entry: the Nuxt/Nitro server, hosted sites under /sites/*, and the Sandbox Durable Object class.
// @ts-ignore built output
import nitro from './.output/server/index.mjs'
import { serveSite } from './sandbox/build'
export { Sandbox } from './sandbox/do'
export default {
  async fetch(req: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/sites/') || url.pathname === '/sites') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      return serveSite(env, url)
    }
    return nitro.fetch(req, env, ctx)
  },
}
