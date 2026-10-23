// Bridges every /api/* request to the existing Worker API router (server/lib).
// Bindings (DB, UPLOADS) and secrets come from the Cloudflare env; when they are
// missing the handlers return honest 501/401 errors — nothing is mocked.
import { handle } from '../lib/index'
import { fail } from '../lib/lib'

export default defineEventHandler(async (event) => {
  const cf = (event.context as any).cloudflare
  if (!cf?.env) return fail(501, 'API runtime not available: run on Cloudflare Workers (wrangler dev / deploy) to enable the API.', undefined, 'no_runtime')
  const req = toWebRequest(event)
  return handle(req, cf.env, cf.context ?? { waitUntil() {}, passThroughOnException() {} })
})
