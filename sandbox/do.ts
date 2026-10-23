// One Durable Object + Container per chat identity (getByName). Commands run with a hard timeout and capped output.
import { Files } from '@cloudflare/sandbox'
import { DurableObject } from 'cloudflare:workers'
const IDLE_MS = 10 * 60_000
const CAP = 16_000
const dec = (b?: Uint8Array) => b ? new TextDecoder().decode(b) : ''
const cap = (s: string) => s.length > CAP ? s.slice(0, CAP) + `\n…[truncated ${s.length - CAP} chars]` : s
export class Sandbox extends DurableObject<any> {
  private files: Files
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env)
    this.files = new Files(ctx.container!)
    if (ctx.container?.running) void ctx.blockConcurrencyWhile(() => ctx.container!.setInactivityTimeout(IDLE_MS))
  }
  private async ensure(internet: boolean) {
    const c = this.ctx.container!
    if (!c.running) { c.start({ image: (c as any).images.sandbox, enableInternet: internet }); await c.setInactivityTimeout(IDLE_MS) }
    return c
  }
  async exec(argv: string[], o: { timeoutSec?: number, internet?: boolean, cwd?: string } = {}) {
    const c = await this.ensure(!!o.internet)
    const t = Math.min(Math.max(o.timeoutSec || 30, 1), 120)
    const started = Date.now()
    const p = await c.exec(['timeout', '-k', '2', String(t), ...argv], { cwd: o.cwd || '/workspace' })
    const out = await p.output()
    return { exitCode: out.exitCode, timedOut: out.exitCode === 124, stdout: cap(dec(out.stdout)), stderr: cap(dec(out.stderr)), ms: Date.now() - started }
  }
  async write(path: string, content: string, internet = false) { await this.ensure(internet); await this.files.writeFile(path, content); return { ok: true, path, bytes: content.length } }
  async read(path: string, internet = false) { await this.ensure(internet); const r = await this.files.readFile(path); return { path, content: cap(await r.text()) } }
}
