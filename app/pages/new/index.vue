<script setup lang="ts">
import type { StepperItem, TabsItem } from '@nuxt/ui'
definePageMeta({ layout: 'dashboard' })
const title = 'New Project — Aibotq.dev'
const description = 'Import a Git repository, upload a folder or start from a template, configure it and deploy to the edge on Aibotq.dev.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev/new/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })

const NEXT_NEW = '/new/?step=1'
const MAX_BYTES = 50 * 1024 * 1024, MAX_FILES = 1000
const IGNORE = new Set(['node_modules', '.git', '.next', '.wrangler', '.DS_Store'])
const toast = useToast()
const { user, cfg, loaded, error: cfgError, load, login, logout } = useSession()

const step = ref(0)
const stepItems: StepperItem[] = [
  { title: 'Connect source', description: 'Git, upload or template', icon: 'i-lucide-git-branch' },
  { title: 'Configure', description: 'Name, build, env vars', icon: 'i-lucide-sliders-horizontal' },
  { title: 'Deploy', description: 'Ship to the edge', icon: 'i-lucide-rocket' },
]
const heads = [
  ['Launch your next agent', 'Connect a Git repository or start from a template. Every push ships to the edge with a preview URL.'],
  ['Tune your setup', 'Check the detected settings, add environment variables, and create the project.'],
  ['Deploy to the edge', 'Status and logs below are the real thing, straight from the build pipeline.'],
]
const alert = ref<{ color: 'error' | 'warning' | 'success' | 'info', text: string, auth?: boolean } | null>(null)
function needAuth(what: string) { alert.value = { color: 'warning', text: `Sign in to ${what}.`, auth: true } }
const slug = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40)
const fmtBytes = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

function go(n: number) {
  step.value = n
  const u = new URL(location.href); u.search = ''; u.searchParams.set('step', String(n + 1))
  if (project.value && n === 2) u.searchParams.set('project', project.value.id)
  history.replaceState(null, '', u)
  if (n !== 2) stopPoll()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ---------- repositories ----------
const provider = ref('github')
const providerTabs: TabsItem[] = [{ label: 'GitHub', value: 'github', icon: 'i-simple-icons-github' }, { label: 'GitLab', value: 'gitlab', icon: 'i-simple-icons-gitlab' }, { label: 'Bitbucket', value: 'bitbucket', icon: 'i-simple-icons-bitbucket' }]
const q = ref(''), page = ref(1), repos = ref<any[]>([]), hasMore = ref(false), reposLoading = ref(false), reposError = ref(''), reposHint = ref('')
let reqId = 0
const connected = computed(() => !!user.value?.connected?.[provider.value])
const providerConfigured = computed(() => !!cfg.value?.providers?.[provider.value]?.configured)
async function loadRepos(reset: boolean) {
  const id = ++reqId
  reposError.value = ''; reposHint.value = ''
  if (reset) { page.value = 1; repos.value = [] }
  if (!connected.value) { hasMore.value = false; return }
  reposLoading.value = true
  try {
    const d = await aq(`/repos?provider=${provider.value}&q=${encodeURIComponent(q.value)}&page=${page.value}`)
    if (id !== reqId) return
    repos.value = reset ? d.repos : [...repos.value, ...d.repos]
    hasMore.value = !!d.has_more
    if (d.truncated) reposHint.value = 'Search covered your 500 most recently pushed repositories only.'
  } catch (e: any) { if (id === reqId) { reposError.value = e.message; hasMore.value = false } }
  finally { if (id === reqId) reposLoading.value = false }
}
let qt: any
watch(q, () => { clearTimeout(qt); qt = setTimeout(() => loadRepos(true), 300) })
watch(provider, () => { q.value = ''; loadRepos(true) })

// ---------- public URL ----------
const repoUrl = ref(''), urlBusy = ref(false), urlMsg = ref<{ ok: boolean, text: string } | null>(null)
async function onUrl() {
  const v = repoUrl.value.trim()
  if (!v) { urlMsg.value = { ok: false, text: 'Enter a repository URL, e.g. https://github.com/user/repo' }; return }
  if (!user.value) { urlMsg.value = { ok: false, text: 'Sign in first — the repository check runs with your account.' }; return needAuth('check and import a repository URL') }
  urlBusy.value = true; urlMsg.value = { ok: true, text: 'Checking repository…' }
  try {
    const d = await aq('/repos/resolve', { method: 'POST', body: { url: v } })
    urlMsg.value = { ok: true, text: `Found ${d.repo.full_name} on ${LABEL[d.repo.provider]}.` }
    chooseSource('url', d.repo)
  } catch (e: any) { urlMsg.value = { ok: false, text: e.message } }
  finally { urlBusy.value = false }
}

// ---------- upload ----------
const uploadsOn = computed(() => !!cfg.value?.uploads)
const upProgress = ref<number | null>(null), upError = ref('')
const dirInput = ref<HTMLInputElement>(), zipInput = ref<HTMLInputElement>()
const dragOver = ref(false)
function pick(el?: HTMLInputElement) {
  if (!uploadsOn.value) { upError.value = 'Upload is not enabled on this server: no R2 bucket is bound to UPLOADS. Import from Git instead.'; return }
  if (!user.value) return needAuth('upload a project')
  el?.click()
}
async function walkEntry(entry: any, prefix: string, out: { file: File, path: string }[]): Promise<void> {
  if (IGNORE.has(entry.name) || entry.name.startsWith('.env')) return
  if (entry.isFile) { const f: File = await new Promise((res, rej) => entry.file(res, rej)); out.push({ file: f, path: prefix + entry.name }); return }
  const reader = entry.createReader()
  for (;;) { const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; for (const e of batch) await walkEntry(e, prefix + entry.name + '/', out) }
}
async function onDrop(e: DragEvent) {
  dragOver.value = false
  if (!uploadsOn.value) return pick()
  if (!user.value) return needAuth('upload a project')
  const dt = e.dataTransfer!; const entries = [...dt.items].map(i => (i as any).webkitGetAsEntry?.()).filter(Boolean)
  try {
    const out: { file: File, path: string }[] = []
    if (entries.length === 1 && entries[0].isDirectory) { const r = entries[0].createReader(); for (;;) { const b: any[] = await new Promise((res, rej) => r.readEntries(res, rej)); if (!b.length) break; for (const x of b) await walkEntry(x, '', out) } return doUpload(out, entries[0].name) }
    for (const en of entries) await walkEntry(en, '', out)
    const zipOnly = out.length === 1 && /\.zip$/i.test(out[0]!.path)
    doUpload(out, zipOnly ? out[0]!.path.replace(/\.zip$/i, '') : 'upload')
  } catch (ex: any) { upError.value = 'Could not read the dropped items: ' + ex.message }
}
function onDirPicked() {
  const files = [...(dirInput.value?.files || [])]
  const root = files[0]?.webkitRelativePath?.split('/')[0] || 'upload'
  const items = files.map(f => ({ file: f, path: f.webkitRelativePath.split('/').slice(1).join('/') || f.name })).filter(o => !o.path.split('/').some(p => IGNORE.has(p) || p.startsWith('.env')))
  doUpload(items, root); dirInput.value!.value = ''
}
function onZipPicked() { const f = zipInput.value?.files?.[0]; if (f) doUpload([{ file: f, path: f.name }], f.name.replace(/\.zip$/i, '')); zipInput.value!.value = '' }
async function doUpload(items: { file: File, path: string }[], rootName: string) {
  upError.value = ''
  if (!items.length) { upError.value = 'No uploadable files found (node_modules, .git and .env files are skipped).'; return }
  const total = items.reduce((n, o) => n + o.file.size, 0)
  if (items.length > MAX_FILES) { upError.value = `Too many files (${items.length}; limit ${MAX_FILES}).`; return }
  if (total > MAX_BYTES) { upError.value = `Upload is ${fmtBytes(total)} — the limit is ${fmtBytes(MAX_BYTES)}.`; return }
  const fd = new FormData(); items.forEach(o => fd.append('files', o.file, o.path))
  let pkg = null; const pj = items.find(o => o.path === 'package.json'); if (pj) { try { pkg = JSON.parse(await pj.file.text()) } catch {} }
  upProgress.value = 0
  try {
    const d: any = await new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', '/api/upload'); x.responseType = 'json'
      x.upload.onprogress = (e) => { if (e.lengthComputable) upProgress.value = Math.round((e.loaded / e.total) * 100) }
      x.onerror = () => reject(new Error('Upload failed: network error.'))
      x.onload = () => { const j = x.response; if (j?.ok) resolve(j.data); else reject(new Error(j?.error || `Upload failed (HTTP ${x.status}).`)) }
      x.send(fd)
    })
    toast.add({ color: 'success', title: `Uploaded ${d.file_count} file${d.file_count === 1 ? '' : 's'}` })
    chooseSource('upload', { name: rootName, upload_id: d.upload_id, file_count: d.file_count, bytes: d.bytes, pkg })
  } catch (e: any) { upError.value = e.message } finally { upProgress.value = null }
}

// ---------- templates ----------
const TPL = [
  { id: 'agent-app', title: 'Agent App', description: 'Full-stack agent with tools & memory.', icon: 'i-lucide-bot', tag: 'TypeScript' },
  { id: 'ai-chatbot', title: 'AI Chatbot', description: 'Streaming chat UI, any model.', icon: 'i-lucide-messages-square', tag: 'Next.js' },
  { id: 'commerce-agent', title: 'Commerce Agent', description: 'Shop assistant over your catalog.', icon: 'i-lucide-shopping-bag', tag: 'RAG' },
]
const templates = ref<Record<string, string>>({}), tplLoaded = ref(false)
const tplOpen = ref<string | null>(null), tplName = ref(''), tplPrivate = ref(true), tplBusy = ref(false), tplError = ref('')
async function loadTemplates() { try { const d = await aq('/templates'); d.templates.forEach((t: any) => (templates.value[t.id] = t.repo)) } catch {} finally { tplLoaded.value = true } }
function openTemplate(id: string) {
  track('click', { target: 'tpl_' + id })
  if (!user.value) return needAuth('create a repository from a template')
  tplOpen.value = id; tplName.value = id; tplError.value = ''
  if (tplLoaded.value && !templates.value[id]) tplError.value = `The "${id}" template is not configured on this server (missing from the TEMPLATES variable).`
}
async function createFromTemplate() {
  tplBusy.value = true; tplError.value = ''
  try {
    const d = await aq(`/templates/${encodeURIComponent(tplOpen.value!)}/create`, { method: 'POST', body: { name: tplName.value.trim(), private: tplPrivate.value } })
    toast.add({ color: 'success', title: `Created ${d.repo.full_name}` }); tplOpen.value = null
    chooseSource('template', d.repo)
  } catch (e: any) { tplError.value = e.message } finally { tplBusy.value = false }
}

// ---------- configure ----------
const source = ref<any>(null)
const form = reactive({ name: '', framework: 'other', root: '', build: '', out: '' })
const dirty = new Set<string>()
const nameError = ref(''), cfgError2 = ref(''), cfgBusy = ref(false)
const detected = ref<{ state: 'loading' | 'ok' | 'warn', text: string } | null>(null)
const envRows = ref<{ k: string, v: string }[]>([{ k: '', v: '' }]), envPaste = ref(''), envPasteOpen = ref(false)
const fwItems = Object.entries(FW).map(([value, label]) => ({ value, label }))
function chooseSource(kind: string, r: any) {
  alert.value = null; dirty.clear()
  source.value = kind === 'upload' ? { kind, name: r.name || 'upload', upload_id: r.upload_id, file_count: r.file_count, bytes: r.bytes, pkg: r.pkg }
    : { kind, provider: r.provider, full_name: r.full_name, name: r.name, private: r.private, branch: r.default_branch, html_url: r.html_url }
  Object.assign(form, { name: slug(source.value.name), framework: 'other', root: '', build: '', out: '' })
  nameError.value = ''; cfgError2.value = ''; envRows.value = [{ k: '', v: '' }]; envPasteOpen.value = false
  go(1); detect()
}
function pkgDetect(pkg: any) {
  if (!pkg) return { framework: 'static', build_command: '', output_dir: '.' }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }, has = (n: string) => n in deps
  const b = pkg.scripts?.build ? 'npm run build' : ''
  if (has('next')) return { framework: 'nextjs', build_command: b || 'npx next build', output_dir: '.next' }
  if (has('nuxt')) return { framework: 'nuxt', build_command: b || 'npx nuxt build', output_dir: '.output' }
  if (has('astro')) return { framework: 'astro', build_command: b || 'npx astro build', output_dir: 'dist' }
  if (has('@sveltejs/kit')) return { framework: 'sveltekit', build_command: b || 'npx vite build', output_dir: '.svelte-kit' }
  if (has('@remix-run/react') || has('@remix-run/node')) return { framework: 'remix', build_command: b || 'npx remix build', output_dir: 'build' }
  if (has('vite')) return { framework: 'vite', build_command: b || 'npx vite build', output_dir: 'dist' }
  if (has('react-scripts')) return { framework: 'cra', build_command: b || 'npx react-scripts build', output_dir: 'build' }
  return { framework: 'other', build_command: b, output_dir: b ? 'dist' : '.' }
}
function applyDetected(d: any, note: string) {
  if (!dirty.has('framework')) form.framework = d.framework
  if (!dirty.has('build')) form.build = d.build_command
  if (!dirty.has('out')) form.out = d.output_dir === '.' ? '' : d.output_dir
  detected.value = { state: 'ok', text: note + (FW[d.framework] || d.framework) }
}
let detectId = 0
async function detect() {
  const s = source.value, id = ++detectId
  if (s.kind === 'upload') return applyDetected(pkgDetect(s.pkg), s.pkg ? 'Detected from package.json: ' : 'No package.json in the upload — treated as ')
  detected.value = { state: 'loading', text: 'Detecting framework from the repository…' }
  try {
    const p = new URLSearchParams({ provider: s.provider, repo: s.full_name, root: form.root.trim().replace(/^\.\/?$/, '') })
    if (s.branch) p.set('branch', s.branch)
    const d = await aq('/repos/detect?' + p)
    if (id !== detectId) return
    if (!dirty.has('name') && d.name) form.name = slug(d.name) || form.name
    applyDetected(d, d.has_package_json ? 'Detected from package.json: ' : 'No package.json found — treated as ')
  } catch (e: any) { if (id === detectId) detected.value = { state: 'warn', text: `Couldn't auto-detect settings (${e.message}). Fill them in manually.` } }
}
let rt: any
watch(() => form.root, () => { clearTimeout(rt); rt = setTimeout(() => source.value && source.value.kind !== 'upload' && detect(), 700) })
function addParsedEnv() {
  const pairs: [string, string][] = []
  for (const raw of envPaste.value.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, ''); if (!line || line.startsWith('#')) continue
    const i = line.indexOf('='); if (i < 1) continue
    let v = line.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1)
    pairs.push([line.slice(0, i).trim(), v])
  }
  if (!pairs.length) return toast.add({ color: 'error', title: 'No KEY=value lines found.' })
  envRows.value = [...envRows.value.filter(r => r.k || r.v), ...pairs.map(([k, v]) => ({ k, v }))]
  envPaste.value = ''; envPasteOpen.value = false
}
function collectEnv() {
  const env: Record<string, string> = {}
  for (const { k: rk, v } of envRows.value) {
    const k = rk.trim(); if (!k && !v) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw new Error(`"${k || '(empty)'}" is not a valid variable name (letters, digits and _, not starting with a digit).`)
    if (k in env) throw new Error(`Duplicate variable: ${k}`)
    if (v.length > 4096) throw new Error(`Value for ${k} is longer than 4096 characters.`)
    env[k] = v
  }
  if (Object.keys(env).length > 64) throw new Error('Too many environment variables (max 64).')
  return env
}
async function onConfigure() {
  const s = source.value, name = form.name.trim()
  nameError.value = ''; cfgError2.value = ''
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(name)) { nameError.value = 'Use 2–40 characters: lowercase letters, numbers and hyphens, starting with a letter or number.'; return }
  let env; try { env = collectEnv() } catch (e: any) { cfgError2.value = e.message; return }
  const body: any = { name, source: s.kind, framework: form.framework, build_command: form.build.trim(), output_dir: form.out.trim(), root_dir: form.root.trim().replace(/^\.\/?$/, ''), env }
  if (s.kind === 'upload') body.upload_id = s.upload_id; else { body.provider = s.provider; body.repo_full_name = s.full_name }
  cfgBusy.value = true
  try { const d = await aq('/projects', { method: 'POST', body }); project.value = d.project; dep.value = null; enterDeploy() }
  catch (e: any) { cfgError2.value = e.message; if (e.status === 401) needAuth('create a project') }
  finally { cfgBusy.value = false }
}
const sourceRows = computed(() => {
  const s = source.value; if (!s) return []
  return s.kind === 'upload' ? [['Source', 'Upload'], ['Files', String(s.file_count)], ['Size', fmtBytes(s.bytes)]]
    : [['Source', ({ import: 'Imported repo', url: 'Public URL', template: 'New from template' } as any)[s.kind]], ['Repository', s.full_name], ['Branch', s.branch || 'default'], ['Visibility', s.private ? 'Private' : 'Public']]
})

// ---------- deploy ----------
const project = ref<any>(null), dep = ref<any>(null), depAlert = ref<{ color: any, text: string } | null>(null), depBusy = ref(false)
let poll: any = null
function stopPoll() { if (poll) { clearTimeout(poll.t); poll = null } }
onBeforeUnmount(stopPoll)
const projectRows = computed(() => {
  const p = project.value; if (!p) return []
  return [['Project', p.name], ['Source', p.repo_full_name || 'Upload'], ['Branch', p.branch || '—'], ['Framework', FW[p.framework] || p.framework], ['Build command', p.build_command || '(none)'], ['Output directory', p.output_dir || '(project root)'], ['Root directory', p.root_dir || '(repository root)'], ['Environment', p.env_keys?.length ? `${p.env_keys.length} variable${p.env_keys.length > 1 ? 's' : ''}: ${p.env_keys.join(', ')}` : 'none']]
})
const webhookNote = computed(() => {
  const ws = project.value?.webhook_status || ''
  if (ws === 'active') return { color: 'success', text: 'Git push = deploy is active: pushes to the default branch deploy to production, pull requests get previews.' }
  if (ws && ws !== 'pending') return { color: 'warning', text: 'Automatic deploys are not active — ' + ws.replace(/^\w+:\s*/, '') }
  return null
})
function enterDeploy(resume?: any) {
  depAlert.value = cfg.value && !cfg.value.deploy ? { color: 'warning', text: 'The build pipeline is not configured on this server (DEPLOY_WEBHOOK_URL / DEPLOY_WEBHOOK_SECRET). A deploy will fail until the operator sets it up.' } : null
  dep.value = null; go(2)
  if (resume) { dep.value = resume; if (resume.status === 'queued' || resume.status === 'building') startPoll(resume.id) }
}
const depStep = computed(() => { const s = dep.value?.status; return s === 'queued' ? 0 : s === 'building' ? 1 : s === 'ready' ? 2 : s === 'failed' ? (/build/i.test(dep.value.step || '') ? 1 : 0) : 0 })
const depItems = computed<StepperItem[]>(() => [{ title: 'Queued', icon: 'i-lucide-clock' }, { title: 'Building', icon: 'i-lucide-hammer' }, { title: dep.value?.status === 'failed' ? 'Failed' : 'Live', icon: dep.value?.status === 'failed' ? 'i-lucide-x' : 'i-lucide-radio' }])
const depRunning = computed(() => dep.value && (dep.value.status === 'queued' || dep.value.status === 'building'))
const failedMsg = computed(() => dep.value?.status === 'failed' ? (/Deploy failed:[^\n]*/.exec(dep.value.log || '')?.[0] || 'Deploy failed. See the log above for details.') : '')
async function startDeploy() {
  depBusy.value = true; depAlert.value = null
  try { const d = await aq(`/projects/${project.value.id}/deploy`, { method: 'POST', body: {} }); dep.value = d.deployment; startPoll(d.deployment.id) }
  catch (e: any) {
    if (e.code === 'in_progress') { try { const pd = await aq(`/projects/${project.value.id}`); if (pd.latest_deployment) { depAlert.value = { color: 'info', text: 'A deployment is already running — showing it.' }; dep.value = pd.latest_deployment; startPoll(pd.latest_deployment.id); return } } catch {} }
    const id = e.extra?.deployment_id; if (id) { try { dep.value = (await aq('/deployments/' + id)).deployment } catch {} }
    depAlert.value = { color: 'error', text: e.message }
  } finally { depBusy.value = false }
}
function startPoll(id: string) {
  stopPoll(); const st: any = { fails: 0, n: 0 }; poll = st
  const tick = async () => {
    if (poll !== st) return
    try { const d = (await aq('/deployments/' + id)).deployment; st.fails = 0; if (poll !== st) return; dep.value = d; if (d.status !== 'queued' && d.status !== 'building') return stopPoll() }
    catch (e: any) { st.fails++; if (e.status === 401) { stopPoll(); depAlert.value = { color: 'warning', text: 'Your session expired. Sign in again to keep watching this deployment.' }; return } if (st.fails >= 3) depAlert.value = { color: 'warning', text: `Lost contact with the API (${e.message}). Retrying…` } }
    st.n++; st.t = setTimeout(tick, st.n > 30 ? 4000 : 2000)
  }
  st.t = setTimeout(tick, 1200)
}
async function copyLog() { try { await navigator.clipboard.writeText(dep.value?.log || ''); toast.add({ title: 'Log copied' }) } catch {} }

onMounted(async () => {
  const p = new URLSearchParams(location.search)
  if (p.get('auth_error')) alert.value = { color: 'error', text: 'Sign-in failed: ' + p.get('auth_error') }
  await load()
  if (cfgError.value) alert.value = { color: 'error', text: cfgError.value }
  loadTemplates().then(() => { const t = p.get('template'); if (t) openTemplate(t) })
  if (user.value) loadRepos(true)
  const pid = p.get('project')
  if (pid) {
    if (!user.value) needAuth('open this project')
    else { try { const d = await aq('/projects/' + encodeURIComponent(pid)); project.value = d.project; enterDeploy(d.latest_deployment || null) } catch (e: any) { alert.value = { color: 'error', text: `Couldn't open that project: ${e.message}` } } }
  }
})
</script>

<template>
  <UDashboardPanel id="new-project">
    <template #header>
      <UDashboardNavbar title="New project" icon="i-lucide-plus">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
    <div class="max-w-6xl w-full mx-auto">
    <UPageHeader :headline="`New project · step ${step + 1} of 3`" :title="heads[step]![0]" :description="heads[step]![1]" class="border-none pt-0">
      <template #links>
        <UButton to="/dashboard/" label="Dashboard" color="neutral" variant="subtle" icon="i-lucide-layout-dashboard" />
      </template>
    </UPageHeader>

    <UStepper v-model="step" :items="stepItems" disabled class="my-8" color="primary" />

    <UAlert v-if="alert" :color="alert.color" variant="subtle" :title="alert.text" icon="i-lucide-info" class="mb-6" :close="true" :actions="alert.auth ? [{ label: 'Continue with GitHub', icon: 'i-simple-icons-github', onClick: () => login('github', 'login', NEXT_NEW) }] : []" @update:open="alert = null" />

    <!-- Step 1 -->
    <div v-show="step === 0" class="grid gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-3">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="font-semibold text-highlighted text-lg">Import Git repository</h2>
              <p class="text-sm text-muted">{{ user ? 'Choose a repository from your account.' : 'Pick a provider to list your repositories.' }}</p>
            </div>
            <div v-if="user" class="flex items-center gap-2">
              <UUser :name="'@' + user.login" :avatar="{ src: user.avatar, alt: user.login }" size="sm" />
              <UButton label="Log out" size="xs" color="neutral" variant="ghost" @click="logout()" />
            </div>
          </div>
        </template>

        <ClientOnly>
          <div v-if="!loaded" class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-12 w-full" /></div>
          <div v-else-if="!user" class="space-y-3">
            <UButton label="Continue with GitHub" icon="i-simple-icons-github" size="lg" block @click="login('github', 'login', NEXT_NEW)" />
            <div class="grid grid-cols-2 gap-3">
              <UButton label="GitLab" icon="i-simple-icons-gitlab" color="neutral" variant="subtle" block @click="login('gitlab', 'login', NEXT_NEW)" />
              <UButton label="Bitbucket" icon="i-simple-icons-bitbucket" color="neutral" variant="subtle" block @click="login('bitbucket', 'login', NEXT_NEW)" />
            </div>
            <p class="text-xs text-muted flex items-center gap-1.5"><UIcon name="i-lucide-lock" /> Sign-in uses OAuth. Tokens are stored encrypted and never sent to your browser.</p>
          </div>
          <div v-else class="space-y-4">
            <UTabs v-model="provider" :items="providerTabs" :content="false" variant="link" size="sm" />
            <UInput v-model="q" icon="i-lucide-search" placeholder="Search repositories" :disabled="!connected" class="w-full" />
            <UAlert v-if="!connected" color="neutral" variant="subtle" :title="providerConfigured ? `${LABEL[provider]} isn't connected to your account.` : `${LABEL[provider]} is not configured yet.`" :description="providerConfigured ? undefined : 'The server operator needs to add OAuth credentials for it.'" :actions="providerConfigured ? [{ label: `Connect ${LABEL[provider]}`, onClick: () => login(provider, 'login', NEXT_NEW) }] : []" />
            <UAlert v-else-if="reposError" color="error" variant="subtle" :title="reposError" />
            <div v-else class="divide-y divide-default rounded-lg ring ring-default">
              <div v-for="r in repos" :key="r.full_name" class="flex items-center gap-3 px-4 py-3">
                <UIcon name="i-lucide-book-marked" class="size-5 text-muted shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-highlighted truncate">{{ r.full_name }}</p>
                  <p class="text-xs text-muted truncate">{{ [r.description, r.language, r.updated_at && timeAgo(r.updated_at)].filter(Boolean).join(' · ') || 'No description' }}</p>
                </div>
                <UBadge v-if="r.private" label="Private" color="neutral" variant="subtle" size="sm" />
                <UButton label="Import" size="sm" @click="chooseSource('import', r)" />
              </div>
              <template v-if="reposLoading"><div v-for="i in 3" :key="i" class="px-4 py-3"><USkeleton class="h-8 w-full" /></div></template>
              <p v-if="!reposLoading && !repos.length" class="px-4 py-8 text-center text-sm text-muted">{{ q ? `No repositories match "${q}".` : `No repositories found on ${LABEL[provider]}.` }}</p>
            </div>
            <p v-if="reposHint" class="text-xs text-muted">{{ reposHint }}</p>
            <UButton v-if="hasMore" label="Load more" color="neutral" variant="subtle" block :loading="reposLoading" @click="page++; loadRepos(false)" />
          </div>
        </ClientOnly>

        <USeparator label="OR" class="my-6" />

        <form class="space-y-2" @submit.prevent="onUrl">
          <UFormField label="Public repository URL" :error="urlMsg && !urlMsg.ok ? urlMsg.text : undefined" :help="urlMsg?.ok ? urlMsg.text : 'Paste any public GitHub, GitLab or Bitbucket URL.'">
            <UFieldGroup class="w-full">
              <UInput v-model="repoUrl" placeholder="https://github.com/user/repo" icon="i-lucide-link" class="w-full" />
              <UButton type="submit" label="Continue" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-right" :loading="urlBusy" />
            </UFieldGroup>
          </UFormField>
        </form>

        <div
          class="mt-6 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
          :class="dragOver ? 'border-primary bg-primary/5' : 'border-default'"
          @dragover.prevent="dragOver = true" @dragenter.prevent="dragOver = true" @dragleave.prevent="dragOver = false" @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-upload-cloud" class="size-8 text-muted mx-auto" />
          <p class="mt-2 font-medium text-highlighted">{{ cfg && !uploadsOn ? 'Uploads are not enabled on this server' : 'Or drop a project folder or .zip here' }}</p>
          <p class="text-xs text-muted">{{ cfg && !uploadsOn ? 'An R2 bucket must be bound to UPLOADS (see the README).' : '50 MB · 1000 files · node_modules, .git and .env are skipped' }}</p>
          <div class="mt-4 flex justify-center gap-2">
            <UButton label="Choose a folder" size="sm" color="neutral" variant="subtle" icon="i-lucide-folder" @click="pick(dirInput)" />
            <UButton label="Choose a .zip" size="sm" color="neutral" variant="subtle" icon="i-lucide-file-archive" @click="pick(zipInput)" />
          </div>
          <input ref="dirInput" type="file" class="hidden" webkitdirectory multiple @change="onDirPicked">
          <input ref="zipInput" type="file" class="hidden" accept=".zip,application/zip" @change="onZipPicked">
          <UProgress v-if="upProgress !== null" v-model="upProgress" class="mt-4" />
          <UAlert v-if="upError" color="error" variant="subtle" :title="upError" class="mt-4 text-start" />
        </div>
      </UCard>

      <div class="lg:col-span-2 space-y-4">
        <div>
          <h2 class="font-semibold text-highlighted text-lg">Start from a template</h2>
          <p class="text-sm text-muted">Cloned into your GitHub, deployed in one go.</p>
        </div>
        <UPageCard
          v-for="t in TPL" :key="t.id" :title="t.title" :description="t.description" :icon="t.icon" orientation="horizontal"
          :highlight="tplOpen === t.id" highlight-color="neutral" spotlight spotlight-color="neutral" class="cursor-pointer"
          :class="tplLoaded && !templates[t.id] ? 'opacity-60' : ''" @click="openTemplate(t.id)"
        >
          <template #footer><UBadge :label="t.tag" color="neutral" variant="subtle" size="sm" /></template>
        </UPageCard>
        <UCard v-if="tplOpen" variant="subtle">
          <form class="space-y-4" @submit.prevent="createFromTemplate">
            <p class="font-semibold text-highlighted">Create from {{ TPL.find(t => t.id === tplOpen)?.title || tplOpen }}</p>
            <p v-if="templates[tplOpen]" class="text-sm text-muted">Copies <b class="text-highlighted">{{ templates[tplOpen] }}</b> into your GitHub account.</p>
            <UFormField label="New repository name"><UInput v-model="tplName" class="w-full" maxlength="100" /></UFormField>
            <UCheckbox v-model="tplPrivate" label="Private repository" />
            <UAlert v-if="tplError" color="error" variant="subtle" :title="tplError" />
            <div class="flex gap-2">
              <UButton type="submit" label="Create repository" trailing-icon="i-lucide-arrow-right" :loading="tplBusy" :disabled="!templates[tplOpen]" />
              <UButton label="Cancel" color="neutral" variant="ghost" @click="tplOpen = null" />
            </div>
          </form>
        </UCard>
        <UCard variant="soft">
          <div class="flex gap-3">
            <UIcon name="i-lucide-git-merge" class="size-5 text-muted shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold text-highlighted">Git push = deploy</p>
              <p class="text-sm text-muted">Main ships to production. Every pull request gets its own preview URL.</p>
              <UButton to="/docs/#git-push" label="Read deployment docs" variant="link" class="px-0" trailing-icon="i-lucide-arrow-up-right" />
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Step 2 -->
    <div v-if="step === 1 && source" class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <h2 class="font-semibold text-highlighted text-lg">Configure agent</h2>
          <p class="text-sm text-muted">Sensible defaults are detected for you. Change anything.</p>
        </template>
        <form class="space-y-5" @submit.prevent="onConfigure">
          <UAlert v-if="detected" :color="detected.state === 'warn' ? 'warning' : 'success'" variant="subtle" :icon="detected.state === 'loading' ? 'i-lucide-loader-circle' : detected.state === 'ok' ? 'i-lucide-check' : 'i-lucide-triangle-alert'" :title="detected.text" :ui="{ icon: detected.state === 'loading' ? 'animate-spin' : '' }" :actions="detected.state === 'warn' ? [{ label: 'Retry', color: 'neutral', variant: 'subtle', onClick: detect }] : []" />
          <UFormField label="Project name" required :error="nameError || undefined" help="2–40 characters: lowercase letters, numbers and hyphens.">
            <UInput v-model="form.name" class="w-full" @input="dirty.add('name')" />
          </UFormField>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Framework"><USelect v-model="form.framework" :items="fwItems" class="w-full" @update:model-value="dirty.add('framework')" /></UFormField>
            <UFormField label="Root directory" hint="Optional"><UInput v-model="form.root" placeholder="./" class="w-full" /></UFormField>
            <UFormField label="Build command"><UInput v-model="form.build" placeholder="npm run build" class="w-full font-mono" @input="dirty.add('build')" /></UFormField>
            <UFormField label="Output directory"><UInput v-model="form.out" placeholder="dist" class="w-full font-mono" @input="dirty.add('out')" /></UFormField>
          </div>
          <USeparator />
          <div class="flex items-center justify-between">
            <div><p class="font-medium text-highlighted">Environment variables</p><p class="text-xs text-muted">Encrypted at rest. Values are write-only — only the names are ever shown again.</p></div>
            <UButton label="Paste .env" size="sm" color="neutral" variant="subtle" icon="i-lucide-clipboard" @click="envPasteOpen = !envPasteOpen" />
          </div>
          <div v-if="envPasteOpen" class="space-y-2">
            <UTextarea v-model="envPaste" :rows="4" placeholder="KEY=value" class="w-full font-mono" />
            <UButton label="Add variables" size="sm" @click="addParsedEnv" />
          </div>
          <div v-for="(r, i) in envRows" :key="i" class="flex gap-2">
            <UInput v-model="r.k" placeholder="KEY" class="flex-1 font-mono" autocomplete="off" maxlength="64" />
            <UInput v-model="r.v" placeholder="value" type="password" class="flex-1 font-mono" autocomplete="off" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove variable" @click="envRows.splice(i, 1)" />
          </div>
          <UButton label="Add variable" icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" @click="envRows.push({ k: '', v: '' })" />
          <UAlert v-if="cfgError2" color="error" variant="subtle" :title="cfgError2" />
          <div class="flex justify-between gap-2 pt-2">
            <UButton label="Change source" icon="i-lucide-arrow-left" color="neutral" variant="ghost" @click="go(0)" />
            <UButton type="submit" label="Create project" trailing-icon="i-lucide-arrow-right" size="lg" :loading="cfgBusy" />
          </div>
        </form>
      </UCard>
      <div class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UBadge :label="source.kind === 'upload' ? 'Upload' : LABEL[source.provider]" variant="subtle" />
              <p class="font-semibold text-highlighted truncate">{{ source.kind === 'upload' ? source.name : source.full_name }}</p>
            </div>
          </template>
          <dl class="space-y-2 text-sm">
            <div v-for="[k, v] in sourceRows" :key="k" class="flex justify-between gap-4"><dt class="text-muted">{{ k }}</dt><dd class="text-highlighted font-medium truncate">{{ v }}</dd></div>
          </dl>
          <template v-if="source.html_url" #footer><UButton :to="safeUrl(source.html_url)" target="_blank" label="View repo" size="sm" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-up-right" /></template>
        </UCard>
        <UAlert color="neutral" variant="subtle" icon="i-lucide-git-merge" title="Git push = deploy" :description="source.kind === 'upload' ? 'Uploads have no git remote, so you redeploy manually from the dashboard.' : source.provider === 'github' ? 'A GitHub webhook is registered when you create the project: push → production, pull request → preview.' : `Automatic deploys on push are only supported for GitHub. ${LABEL[source.provider]} projects are redeployed manually.`" />
      </div>
    </div>

    <!-- Step 3 -->
    <div v-if="step === 2 && project" class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-6">
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-rocket" class="size-5 text-muted" />
              <div class="flex-1 min-w-0"><p class="font-semibold text-highlighted">{{ project.name }}</p><p class="text-xs text-muted truncate">{{ project.repo_full_name || 'Uploaded files' }}</p></div>
              <UBadge :label="FW[project.framework] || project.framework || 'Other'" color="neutral" variant="subtle" />
            </div>
          </template>
          <template v-if="dep">
            <UStepper :model-value="dep.status === 'ready' ? 2 : depStep" :items="depItems" disabled size="sm" :color="dep.status === 'failed' ? 'error' : 'primary'" />
            <div class="mt-6 flex items-center justify-between text-xs text-muted">
              <span class="font-mono">{{ dep.environment }} · step: {{ dep.step }} · {{ dep.id.slice(0, 8) }}</span>
              <UButton label="Copy" icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" @click="copyLog" />
            </div>
            <pre class="mt-2 max-h-80 overflow-auto rounded-lg bg-elevated/60 ring ring-default p-4 text-xs font-mono text-toned whitespace-pre-wrap">{{ dep.log || 'Waiting for the pipeline to report…' }}</pre>
            <UAlert v-if="dep.status === 'ready'" color="success" variant="subtle" icon="i-lucide-radio" title="Live on the edge" :description="dep.url || '(no URL reported)'" class="mt-4" :actions="safeUrl(dep.url) ? [{ label: 'Visit site', to: safeUrl(dep.url), target: '_blank', trailingIcon: 'i-lucide-arrow-up-right' }] : []" />
            <UAlert v-if="failedMsg" color="error" variant="subtle" :title="failedMsg" class="mt-4" />
          </template>
          <p v-else class="text-sm text-muted">Review the summary, then deploy. Status and logs here come straight from the build pipeline.</p>
          <UAlert v-if="depAlert" :color="depAlert.color" variant="subtle" :title="depAlert.text" class="mt-4" />
          <template #footer>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="!depRunning" :label="dep?.status === 'ready' ? 'Deploy again' : dep?.status === 'failed' ? 'Retry deploy' : 'Deploy to edge'" icon="i-lucide-zap" size="lg" :loading="depBusy" @click="startDeploy" />
              <UButton v-else label="Deploying…" loading size="lg" disabled />
              <UButton to="/dashboard/" label="Go to dashboard" color="neutral" variant="subtle" size="lg" />
              <UButton to="/new/" external label="New project" color="neutral" variant="ghost" size="lg" />
            </div>
          </template>
        </UCard>
      </div>
      <div class="space-y-4">
        <UCard>
          <template #header><p class="font-semibold text-highlighted">Summary</p></template>
          <dl class="space-y-2 text-sm">
            <div v-for="[k, v] in projectRows" :key="k" class="flex justify-between gap-4"><dt class="text-muted shrink-0">{{ k }}</dt><dd class="text-highlighted font-medium text-end break-all">{{ v }}</dd></div>
          </dl>
        </UCard>
        <UAlert v-if="webhookNote" :color="webhookNote.color as any" variant="subtle" :title="webhookNote.text" />
      </div>
    </div>
    </div>
    </template>
  </UDashboardPanel>
</template>
