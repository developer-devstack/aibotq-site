// Self-hosted build pipeline: clone -> install -> build inside the Sandbox container, upload output to R2 (SITES),
// serve at https://aibotq.dev/sites/<slug>/. Deployment rows in D1 are updated directly (no self-fetch).
export interface BuildJob {
  deployment_id: string
  project: { id: string, name: string, framework: string | null, build_command: string | null, output_dir: string | null, root_dir: string | null }
  source: { type: 'git', clone_url: string, branch: string, commit_sha?: string | null, token?: string } | { type: 'upload', manifest_url: string }
  env: Record<string, string>
  origin: string
}
export const siteSlug = (p: { id: string, name: string }) =>
  (p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'site') + '-' + p.id.replace(/-/g, '').slice(0, 6)

const MAX_LOG = 60_000
const MAX_FILES = 2000
const MAX_BYTES = 100 * 1024 * 1024
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const rel = (s: string | null) => (s || '').replace(/^\/+|\/+$/g, '').replace(/\.\.+/g, '')

type Exec = (cmd: string, sec: number) => Promise<{ exitCode: number, out: string }>
type Read = (path: string) => Promise<ArrayBuffer>

export async function runBuild(env: any, job: BuildJob, exec: Exec, read: Read) {
  const id = job.deployment_id
  const secretVals = [job.source.type === 'git' ? job.source.token : '', ...Object.values(job.env || {})].filter((v): v is string => !!v && v.length >= 4)
  const redact = (s: string) => secretVals.reduce((a, v) => a.split(v).join('***'), s)
  const log = (line: string) => env.DB.prepare('UPDATE deployments SET log = substr(log || ?, -?) WHERE id = ?').bind(redact(line).replace(/\n?$/, '\n'), MAX_LOG, id).run()
  const step = (s: string) => env.DB.prepare(`UPDATE deployments SET status = 'building', step = ? WHERE id = ? AND status IN ('queued','building')`).bind(s, id).run()
  const fail = async (reason: string) => {
    await log('Error: ' + reason)
    await env.DB.prepare(`UPDATE deployments SET status = 'failed', step = 'failed' WHERE id = ?`).bind(id).run()
  }
  const sh = async (label: string, cmd: string, sec: number) => {
    await log(`$ ${label}`)
    const r = await exec(cmd, sec)
    if (r.out.trim()) await log(r.out.slice(-6000))
    if (r.exitCode !== 0) throw new Error(`${label} failed (exit ${r.exitCode}${r.exitCode === 124 ? ', timed out' : ''})`)
    return r.out
  }
  try {
    if (!env.SITES) throw new Error('R2 bucket SITES is not bound')
    if (job.source.type !== 'git') throw new Error('Upload sources are not supported by the self-hosted builder yet')
    const src = job.source
    await step('cloning')
    let url = src.clone_url
    if (src.token) { const u = new URL(url); u.username = 'x-access-token'; u.password = src.token; url = u.toString() }
    await sh(`git clone --depth 1 -b ${src.branch} ${src.clone_url}`, `rm -rf /build && mkdir -p /build && git clone --depth 1 -b ${q(src.branch)} ${q(url)} /build/src 2>&1`, 120)
    const sha = (await exec('git -C /build/src rev-parse HEAD', 10)).out.trim()
    const count = (await exec('git -C /build/src ls-files | wc -l', 10)).out.trim()
    if (count === '0') throw new Error('The repository has no files on this branch — push your site code first')
    const dir = '/build/src' + (rel(job.project.root_dir) ? '/' + rel(job.project.root_dir) : '')
    const envExports = Object.entries(job.env || {}).filter(([k]) => /^[A-Z_][A-Z0-9_]*$/i.test(k)).map(([k, v]) => `export ${k}=${q(String(v))}; `).join('')
    const hasPkg = (await exec(`test -f ${q(dir + '/package.json')} && echo yes || echo no`, 10)).out.trim() === 'yes'
    let buildCmd = (job.project.build_command || '').trim()
    if (hasPkg) {
      await step('installing')
      const lock = (await exec(`cd ${q(dir)} && ls pnpm-lock.yaml yarn.lock package-lock.json 2>/dev/null | head -1`, 10)).out.trim()
      const install = lock === 'pnpm-lock.yaml' ? 'corepack enable && pnpm install --frozen-lockfile' : lock === 'yarn.lock' ? 'corepack enable && yarn install --frozen-lockfile' : lock ? 'npm ci' : 'npm install'
      await sh(install, `cd ${q(dir)} && ${envExports}${install} 2>&1 | tail -40`, 600)
      if (!buildCmd) {
        const hasBuild = (await exec(`cd ${q(dir)} && node -e "process.stdout.write(require('./package.json').scripts?.build ? 'y' : 'n')"`, 10)).out === 'y'
        if (hasBuild) buildCmd = 'npm run build'
      }
    }
    if (buildCmd) {
      await step('building')
      await sh(buildCmd, `cd ${q(dir)} && ${envExports}export CI=1 NODE_ENV=production; ${buildCmd} 2>&1 | tail -60; exit \${PIPESTATUS[0]}`, 900)
    }
    await step('uploading')
    const outRel = rel(job.project.output_dir) || (buildCmd ? '' : '.')
    let out = outRel && outRel !== '.' ? `${dir}/${outRel}` : dir
    if (!outRel) {
      const guess = (await exec(`cd ${q(dir)} && for d in dist build out public .output/public _site; do [ -f "$d/index.html" ] && echo "$d" && break; done`, 10)).out.trim()
      if (!guess) throw new Error('Could not find the build output (set Output directory in project settings)')
      out = `${dir}/${guess}`
    }
    const list = (await exec(`cd ${q(out)} && find . -type f -not -path './.git/*' -not -path './node_modules/*' -printf '%s %P\\n' | head -${MAX_FILES + 1}`, 30))
    if (list.exitCode !== 0) throw new Error(`Output directory not found: ${out.replace('/build/src', '') || '/'}`)
    const files = list.out.split('\n').filter(Boolean).map(l => { const i = l.indexOf(' '); return { size: +l.slice(0, i), path: l.slice(i + 1) } })
    if (!files.length) throw new Error('Build output is empty')
    if (files.length > MAX_FILES) throw new Error(`Too many output files (> ${MAX_FILES})`)
    if (!files.some(f => f.path === 'index.html')) await log('Warning: no index.html at the output root')
    const total = files.reduce((a, f) => a + f.size, 0)
    if (total > MAX_BYTES) throw new Error('Build output is larger than 100 MB')
    const slug = siteSlug(job.project)
    const prefix = `sites/${slug}/${id}/`
    for (let i = 0; i < files.length; i += 8) {
      await Promise.all(files.slice(i, i + 8).map(async f => env.SITES.put(prefix + f.path, await read(`${out}/${f.path}`))))
    }
    await log(`Uploaded ${files.length} files (${Math.round(total / 1024)} KB).`)
    const siteUrl = `${job.origin}/sites/${slug}/`
    const d = await env.DB.prepare('SELECT environment, project_id FROM deployments WHERE id = ?').bind(id).first()
    if (d?.environment === 'production') await env.SITES.put(`sites/${slug}/_current`, id)
    await env.DB.prepare(`UPDATE deployments SET status = 'ready', step = 'live', url = ?, commit_sha = COALESCE(?, commit_sha) WHERE id = ?`)
      .bind(d?.environment === 'production' ? siteUrl : `${siteUrl}_d/${id}/`, /^[0-9a-f]{40}$/.test(sha) ? sha : null, id).run()
    if (d?.environment === 'production') await env.DB.prepare(`UPDATE projects SET status = 'live', url = ? WHERE id = ?`).bind(siteUrl, d.project_id).run()
    await log(`Live at ${siteUrl}`)
  } catch (e) {
    await fail(redact(e instanceof Error ? e.message : String(e)))
  }
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', xml: 'application/xml', wasm: 'application/wasm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', map: 'application/json', webmanifest: 'application/manifest+json', mp4: 'video/mp4', pdf: 'application/pdf' }

// GET /sites/<slug>/<path>  (production)  or  /sites/<slug>/_d/<deploymentId>/<path>  (specific deployment)
export async function serveSite(env: any, url: URL): Promise<Response> {
  const m = url.pathname.match(/^\/sites\/([a-z0-9-]+)(\/.*)?$/)
  if (!m || !env.SITES) return new Response('Not found', { status: 404 })
  const slug = m[1]
  if (m[2] === undefined) return Response.redirect(`${url.origin}/sites/${slug}/`, 301)
  let path = decodeURIComponent(m[2]).replace(/^\/+/, '')
  let dep: string | null
  const dm = path.match(/^_d\/([0-9a-f-]{36})\/?(.*)$/)
  if (dm) { dep = dm[1]; path = dm[2] }
  else dep = await (await env.SITES.get(`sites/${slug}/_current`))?.text() ?? null
  if (!dep) return new Response('Site not deployed yet', { status: 404 })
  if (path.includes('..')) return new Response('Bad path', { status: 400 })
  const base = `sites/${slug}/${dep}/`
  const tries = path === '' || path.endsWith('/') ? [path + 'index.html'] : [path, path + '.html', path + '/index.html']
  for (const t of tries) {
    const o = await env.SITES.get(base + t)
    if (o) {
      const ext = t.split('.').pop()!.toLowerCase()
      const h = new Headers({ 'content-type': TYPES[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': ext === 'html' ? 'no-cache' : 'public, max-age=3600' })
      if (ext === 'html') {
        // Root-relative links ("/app.js") would hit aibotq.dev; point relative ones at the site root.
        const html = (await o.text()).replace(/<head([^>]*)>/i, `<head$1><base href="/sites/${slug}/${dm ? `_d/${dep}/` : ''}">`)
        return new Response(html, { headers: h })
      }
      return new Response(o.body, { headers: h })
    }
  }
  const nf = await env.SITES.get(base + '404.html')
  return new Response(nf ? nf.body : 'Not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
