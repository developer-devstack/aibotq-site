<script setup lang="ts">
// Owner-only live activity dashboard. Polls /api/activity/live every 3 s (paused when the tab is hidden).
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Live activity — Aibotq.dev', robots: 'noindex' })
const d = ref<any>(null), err = ref(''), status = ref<'loading' | 'ok' | 'forbidden' | 'error'>('loading'), last = ref(0)
let t: any
async function tick() {
  if (document.hidden) { t = setTimeout(tick, 3000); return }
  try { d.value = await aq('/activity/live'); status.value = 'ok'; last.value = Date.now(); err.value = '' }
  catch (e: any) { status.value = e.status === 403 ? 'forbidden' : 'error'; err.value = e.message }
  if (status.value !== 'forbidden') t = setTimeout(tick, 3000)
}
onMounted(tick); onBeforeUnmount(() => clearTimeout(t))
const bars = computed(() => {
  const m = new Map((d.value?.series || []).map((r: any) => [Number(r.m), r.n])); const now = Math.floor((d.value?.now || Date.now()) / 60000)
  const arr = Array.from({ length: 30 }, (_, i) => Number(m.get(now - 29 + i) || 0)); const max = Math.max(1, ...arr); return arr.map(n => ({ n, h: Math.round(n / max * 100) }))
})
const maxTopic = computed(() => Math.max(1, ...(d.value?.topics || []).map((x: any) => x.n)))
const label = (e: any) => e.type === 'pageview' ? e.path : e.type === 'click' ? `${e.target} on ${e.path}` : `topic: ${e.topic}`
const ICON: Record<string, string> = { pageview: 'i-lucide-eye', click: 'i-lucide-mouse-pointer-click', topic: 'i-lucide-tag' }
</script>
<template>
  <UDashboardPanel id="live">
    <template #header>
      <UDashboardNavbar title="Live activity">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <span v-if="status === 'ok'" class="flex items-center gap-2 text-xs text-muted"><span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span class="relative inline-flex size-2 rounded-full bg-primary" /></span>Live · updated {{ timeAgo(last) }}</span>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div v-if="status === 'loading'" class="text-sm text-muted">Loading…</div>
      <UAlert v-else-if="status === 'forbidden'" color="neutral" variant="subtle" icon="i-lucide-lock" title="Owner only" :description="err" :actions="[{ label: 'Sign in with GitHub', to: '/auth/github', external: true }]" />
      <UAlert v-else-if="status === 'error'" color="error" variant="subtle" title="Could not load live data" :description="err" />
      <div v-else-if="d" class="space-y-6">
        <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <UCard v-for="k in [{ l: 'Active now (5 min)', v: d.active }, { l: 'Visitors (24 h)', v: d.totals?.visitors || 0 }, { l: 'Events (24 h)', v: d.totals?.events || 0 }, { l: 'Chat topics (24 h)', v: d.topics.reduce((a: number, x: any) => a + x.n, 0) }]" :key="k.l">
            <p class="text-xs text-muted">{{ k.l }}</p><p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ k.v }}</p>
          </UCard>
        </div>
        <UCard>
          <p class="text-xs text-muted mb-2">Events per minute · last 30 min</p>
          <div class="flex h-24 items-end gap-1">
            <div v-for="(b, i) in bars" :key="i" class="flex-1 rounded-sm" :class="i === bars.length - 1 ? 'bg-primary' : 'bg-neutral-600'" :style="{ height: Math.max(2, b.h) + '%' }" :title="b.n + ' events'" />
          </div>
        </UCard>
        <div class="grid gap-6 lg:grid-cols-3">
          <UCard class="lg:col-span-1">
            <p class="text-sm font-medium text-highlighted mb-3">Top pages · 1 h</p>
            <p v-if="!d.pages.length" class="text-sm text-muted">No page views in the last hour.</p>
            <div v-for="p in d.pages" :key="p.path" class="flex justify-between py-1 text-sm"><span class="truncate">{{ p.path }}</span><span class="tabular-nums text-muted">{{ p.views }} · {{ p.visitors }}👤</span></div>
          </UCard>
          <UCard>
            <p class="text-sm font-medium text-highlighted mb-3">Trending chat topics · 24 h</p>
            <p v-if="!d.topics.length" class="text-sm text-muted">No chat topics yet.</p>
            <div v-for="x in d.topics" :key="x.topic" class="py-1">
              <div class="flex justify-between text-sm"><span>{{ x.topic }}</span><span class="tabular-nums text-muted">{{ x.n }}</span></div>
              <div class="mt-1 h-1.5 rounded bg-neutral-800"><div class="h-1.5 rounded bg-neutral-400" :style="{ width: (x.n / maxTopic * 100) + '%' }" /></div>
            </div>
          </UCard>
          <UCard>
            <p class="text-sm font-medium text-highlighted mb-3">Recent events</p>
            <p v-if="!d.recent.length" class="text-sm text-muted">No events yet.</p>
            <div v-for="(e, i) in d.recent" :key="i" class="flex items-center gap-2 py-1 text-xs">
              <UIcon :name="ICON[e.type]" class="size-3.5 text-muted shrink-0" />
              <span class="truncate text-default">{{ label(e) }}</span>
              <span class="ml-auto shrink-0 text-dimmed">{{ e.vid }}<template v-if="e.country"> · {{ e.country }}</template> · {{ timeAgo(e.ts) }}</span>
            </div>
          </UCard>
        </div>
        <p class="text-xs text-dimmed">Only visitors who clicked “Allow” are counted. No message text, IPs or browser details are stored.</p>
      </div>
    </template>
  </UDashboardPanel>
</template>
