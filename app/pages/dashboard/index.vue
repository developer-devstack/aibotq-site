<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: "Dashboard \u2014 Aibotq.dev", description: "Your Aibotq.dev projects and deployments.", ogTitle: "Dashboard \u2014 Aibotq.dev", ogDescription: "Your Aibotq.dev projects and deployments.", ogType: 'website', ogUrl: 'https://aibotq.dev/dashboard/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary', robots: "noindex" })
const toast = useToast()
const { user, loaded, load, login } = useSession()
const projects = ref<any[]>([]), sel = ref<string | null>(null), deps = ref<any[]>([]), depSel = ref<string | null>(null), commits = ref<any[]>([]), commitBoard = ref<any[]>([])
const state = ref<'loading' | 'anon' | 'error' | 'ready'>('loading'), errMsg = ref(''), depsErr = ref(''), depAlert = ref(''), busy = ref(false)
let timer: any = null
const stopTimer = () => { clearTimeout(timer); timer = null }
onBeforeUnmount(stopTimer)
const STATUS: Record<string, any> = { ready: 'success', live: 'success', building: 'primary', queued: 'neutral', failed: 'error' }
const cur = computed(() => projects.value.find(p => p.id === sel.value))
const kpis = computed(() => [
  { label: 'Projects', value: projects.value.length, icon: 'i-lucide-folder-git-2' },
  { label: 'Live', value: projects.value.filter(p => p.status === 'live').length, icon: 'i-lucide-radio' },
  { label: 'Deploying now', value: projects.value.filter(p => ['queued', 'building'].includes(p.latest_deployment?.status)).length, icon: 'i-lucide-loader' },
])
async function start() {
  await load(true)
  if (!user.value) { state.value = 'anon'; return }
  await loadProjects()
}
async function loadProjects() {
  try { projects.value = (await aq('/projects')).projects }
  catch (e: any) { if (e.status === 401) { state.value = 'anon'; return } errMsg.value = e.message; state.value = 'error'; return }
  const want = new URLSearchParams(location.search).get('p')
  sel.value = want && projects.value.find(p => p.id === want) ? want : projects.value[0]?.id || null
  state.value = 'ready'
  if (sel.value) loadDeps()
}
function select(id: string) { sel.value = id; depSel.value = null; deps.value = []; depAlert.value = ''; stopTimer(); history.replaceState(null, '', '?p=' + encodeURIComponent(id)); loadDeps() }
async function loadDeps() {
  const id = sel.value; depsErr.value = ''
  try {
    const d = await aq(`/projects/${encodeURIComponent(id!)}/deployments`)
    if (id !== sel.value) return
    deps.value = d.deployments
    if (!depSel.value || !deps.value.find(x => x.id === depSel.value)) depSel.value = deps.value[0]?.id || null
    const p = cur.value, top = deps.value[0]
    if (p && top) { p.latest_deployment = { ...top }; if (top.status === 'ready' && top.environment === 'production') { p.status = 'live'; p.url = top.url } }
    if (deps.value.some(x => x.status === 'queued' || x.status === 'building')) { stopTimer(); timer = setTimeout(loadDeps, 2500) }
  } catch (e: any) { if (id === sel.value) depsErr.value = e.message }
  try {
    const c = await aq(`/projects/${encodeURIComponent(id!)}/commits`)
    if (id !== sel.value) return
    commits.value = c.commits || []
    commitBoard.value = c.deployments || []
  } catch { /* commit board is optional */ }
}
async function redeploy() {
  const p = cur.value; if (!p) return
  busy.value = true; depAlert.value = ''
  try { const d = await aq(`/projects/${encodeURIComponent(p.id)}/deploy`, { method: 'POST', body: {} }); depSel.value = d.deployment.id; toast.add({ color: 'success', title: 'Deployment queued.' }) }
  catch (e: any) { depAlert.value = e.message }
  finally { busy.value = false }
  stopTimer(); loadDeps()
}
const selDep = computed(() => deps.value.find(x => x.id === depSel.value))
async function copyLog() { try { await navigator.clipboard.writeText(selDep.value?.log || ''); toast.add({ title: 'Log copied' }) } catch {} }
const wsLabel = (ws = '') => ws === 'active' ? 'Git push = deploy: active' : 'Auto-deploy: ' + (ws.replace(/^\w+:\s*/, '') || 'off').slice(0, 60)
onMounted(start)
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Projects" icon="i-lucide-layout-grid">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
    <div class="max-w-6xl w-full mx-auto">
    <ClientOnly>
      <div v-if="state === 'loading'" class="space-y-4"><USkeleton class="h-10 w-64" /><USkeleton class="h-28 w-full" /><USkeleton class="h-64 w-full" /></div>

      <UPageCTA v-else-if="state === 'anon'" title="Sign in to see your projects" description="Your dashboard lists every project and deployment tied to your account." variant="subtle"
        :links="[{ label: 'Continue with GitHub', icon: 'i-simple-icons-github', size: 'lg', onClick: () => login('github', 'login', '/dashboard/') }]" />

      <UPageCTA v-else-if="state === 'error'" title="Could not load projects" :description="errMsg" variant="subtle" :links="[{ label: 'Retry', onClick: start }]" />

      <template v-else>
        <UPageHeader headline="Dashboard" title="Your projects" :description="`Signed in as @${user?.login}`" class="border-none pt-0">
          <template #links><UButton to="/new/" label="New project" icon="i-lucide-plus" /></template>
        </UPageHeader>
        <div class="grid gap-4 sm:grid-cols-3 my-8">
          <UCard v-for="k in kpis" :key="k.label">
            <div class="flex items-center gap-3"><UIcon :name="k.icon" class="size-5 text-muted" /><span class="text-sm text-muted">{{ k.label }}</span></div>
            <p class="mt-2 text-3xl font-bold text-highlighted">{{ k.value }}</p>
          </UCard>
        </div>

        <UPageCTA v-if="!projects.length" title="No projects yet." description="Import a repository, upload a folder or start from a template." variant="soft" :links="[{ label: 'Create your first project', to: '/new/' }]" />

        <div v-else class="grid gap-6 lg:grid-cols-3">
          <div class="space-y-2">
            <UPageCard v-for="p in projects" :key="p.id" :title="p.name" :description="p.repo_full_name || 'Uploaded files'" :highlight="p.id === sel" highlight-color="neutral" variant="subtle" class="cursor-pointer" @click="select(p.id)">
              <template #footer>
                <div class="flex items-center gap-2 text-xs text-muted">
                  <UBadge :label="p.latest_deployment?.status || p.status" :color="STATUS[p.latest_deployment?.status || p.status] || 'neutral'" variant="subtle" size="sm" />
                  <span>{{ [FW[p.framework] || p.framework, p.latest_deployment ? `${p.latest_deployment.environment} · ${timeAgo(p.latest_deployment.created_at)}` : `created ${timeAgo(p.created_at)}`].filter(Boolean).join(' · ') }}</span>
                </div>
              </template>
            </UPageCard>
          </div>

          <UCard v-if="cur" class="lg:col-span-2">
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-xl font-bold text-highlighted">{{ cur.name }}</h2>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <UBadge :label="cur.status" :color="STATUS[cur.status] || 'neutral'" variant="subtle" />
                    <UBadge :label="cur.repo_full_name ? `${LABEL[cur.provider]} · ${cur.repo_full_name}` : 'Upload'" color="neutral" variant="subtle" />
                    <UBadge v-if="cur.private" label="Private" color="neutral" variant="outline" />
                    <UBadge :label="FW[cur.framework] || cur.framework || 'Other'" color="neutral" variant="subtle" />
                    <UBadge :label="wsLabel(cur.webhook_status)" :color="cur.webhook_status === 'active' ? 'success' : 'neutral'" variant="subtle" />
                  </div>
                </div>
                <div class="flex gap-2">
                  <UButton v-if="safeUrl(cur.url)" :to="safeUrl(cur.url)" target="_blank" label="Visit" color="neutral" variant="subtle" trailing-icon="i-lucide-arrow-up-right" />
                  <UButton label="Redeploy" icon="i-lucide-zap" :loading="busy" @click="redeploy" />
                </div>
              </div>
            </template>
            <UAlert v-if="safeUrl(cur.url)" color="success" variant="subtle" icon="i-lucide-radio" title="Production" :description="cur.url" class="mb-4" />
            <UAlert v-if="depAlert" color="error" variant="subtle" :title="depAlert" class="mb-4" />
            <h3 class="font-semibold text-highlighted mb-2">Commit board</h3>
            <p v-if="!commits.length && !commitBoard.length" class="text-sm text-muted py-4">No commits yet — deploy once or connect a GitHub repo.</p>
            <ul v-else class="space-y-2 mb-6">
              <li v-for="c in (commits.length ? commits : commitBoard)" :key="c.sha || c.id" class="flex items-start justify-between gap-3 rounded-lg border border-default px-3 py-2">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted truncate">{{ c.message || ((c.environment || 'deploy') + (c.ref ? ' · ' + c.ref : '')) }}</p>
                  <p class="text-xs text-muted font-mono">{{ (c.sha || '').slice(0, 7) }}<span v-if="c.author"> · {{ c.author }}</span><span v-if="c.status"> · {{ c.status }}</span></p>
                </div>
                <UButton v-if="c.url" :to="c.url" target="_blank" size="xs" color="neutral" variant="ghost" icon="i-lucide-external-link" />
              </li>
            </ul>
            <h3 class="font-semibold text-highlighted mb-2">Deployments</h3>
            <UAlert v-if="depsErr" color="error" variant="subtle" :title="depsErr" />
            <p v-else-if="!deps.length" class="text-sm text-muted py-6 text-center">No deployments yet. Hit “Redeploy” to ship this project.</p>
            <div v-else class="divide-y divide-default rounded-lg ring ring-default">
              <button v-for="x in deps" :key="x.id" type="button" class="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-elevated/50" :class="x.id === depSel ? 'bg-elevated/60' : ''" @click="depSel = x.id">
                <UBadge :label="x.status" :color="STATUS[x.status] || 'neutral'" variant="subtle" size="sm" />
                <div class="min-w-0"><p class="text-sm font-medium text-highlighted">{{ x.environment }}{{ x.ref ? ' · ' + x.ref : '' }}</p><p class="text-xs text-muted">{{ x.step }}{{ x.commit_sha ? ' · ' + x.commit_sha.slice(0, 7) : '' }} · {{ timeAgo(x.created_at) }}</p></div>
              </button>
            </div>
            <template v-if="selDep">
              <div class="mt-6 flex items-center justify-between"><h3 class="font-semibold text-highlighted">Log <span class="text-xs text-muted font-mono">{{ selDep.id.slice(0, 8) }} — {{ selDep.status }}</span></h3><UButton label="Copy" icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" @click="copyLog" /></div>
              <pre class="mt-2 max-h-80 overflow-auto rounded-lg bg-elevated/60 ring ring-default p-4 text-xs font-mono text-toned whitespace-pre-wrap">{{ selDep.log || '(empty)' }}</pre>
            </template>
          </UCard>
        </div>
      </template>
    </ClientOnly>
    </div>
    </template>
  </UDashboardPanel>
</template>
