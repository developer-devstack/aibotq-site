<script setup lang="ts">
// Layout from the Nuxt UI chat template (UChatMessages + UChatPrompt inside a dashboard panel).
definePageMeta({ layout: 'dashboard' })
const title = 'Agent chat — Aibotq.dev'
const description = 'Ask the aibotq.dev assistant how to import, configure and deploy your AI agent.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev/chat/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })

type ToolEv = { tool: string, input: any, output?: string, error?: string, pending?: { payload: string, sig: string }, done?: string, busy?: boolean }
type Msg = { id: string, role: 'user' | 'assistant', parts: { type: 'text', text: string }[], tools?: ToolEv[] }
const files = ref<{ name: string, type: string, text?: string, base64?: string }[]>([])
const fileInput = ref<HTMLInputElement>()
async function pickFiles(e: Event) {
  for (const f of Array.from((e.target as HTMLInputElement).files || [])) {
    if (f.size > 4_000_000) { error.value = `${f.name} is too large (max 4 MB)`; continue }
    if (/pdf/i.test(f.type) || f.name.toLowerCase().endsWith('.pdf')) { const b = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); files.value.push({ name: f.name, type: 'application/pdf', base64: btoa(s) }) }
    else files.value.push({ name: f.name, type: f.type || 'text/plain', text: await f.text() })
  }
  if (fileInput.value) fileInput.value.value = ''
}
// Owner mode: token kept only in this tab's sessionStorage and checked server-side.
const adminToken = ref(''); const isAdmin = ref(false); const adminOpen = ref(false); const adminInput = ref('')
async function checkAdmin(t: string) { const r = await fetch('/api/chat/admin', { method: 'POST', headers: { 'x-admin-token': t } }).then(r => r.json()).catch(() => null); isAdmin.value = !!r?.data?.admin; return r?.data }
onMounted(async () => { const t = sessionStorage.getItem('aibotq_admin'); if (t && await checkAdmin(t)) adminToken.value = t })
async function saveAdmin() { const d = await checkAdmin(adminInput.value); if (d?.admin) { adminToken.value = adminInput.value; sessionStorage.setItem('aibotq_admin', adminInput.value); adminOpen.value = false; error.value = '' } else error.value = d?.configured === false ? 'Owner mode is not configured on the server (ADMIN_CHAT_TOKEN missing).' : 'Wrong owner token.'; adminInput.value = '' }
function logoutAdmin() { sessionStorage.removeItem('aibotq_admin'); adminToken.value = ''; isAdmin.value = false }
async function confirmTool(t: ToolEv) {
  t.busy = true
  const r = await fetch('/api/chat/confirm', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': adminToken.value }, body: JSON.stringify(t.pending) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
  t.busy = false; t.done = r.ok ? JSON.stringify(r.data) : 'Error: ' + r.error; if (r.ok) t.pending = undefined
}
const messages = ref<Msg[]>([])
const input = ref('')
const status = ref<'ready' | 'submitted' | 'error'>('ready')
const error = ref('')
type ModelDef = { id: string, label: string, provider: string }
const { data: modelInfo } = await useFetch<any>('/api/models', { default: () => null })
const models = computed<ModelDef[]>(() => modelInfo.value?.data?.models || [])
const model = ref<string | undefined>(modelInfo.value?.data?.default || undefined)
watch(modelInfo, v => { if (!model.value) model.value = v?.data?.default || undefined })
const modelItems = computed(() => models.value.map(m => ({ label: m.label, value: m.id })))
const lastUsed = ref('')
const suggestions = ['What time is it in Bangkok, and what is on nuxt.com right now?', 'How do I deploy a Nuxt app?', 'How do preview deployments work?', 'How do I add a custom domain?']
async function send(text?: string) {
  const t = (text ?? input.value).trim(); if (!t || status.value === 'submitted') return
  input.value = ''; error.value = ''
  messages.value.push({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: t }] })
  status.value = 'submitted'
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...(adminToken.value ? { 'x-admin-token': adminToken.value } : {}) }, body: JSON.stringify({ model: model.value, files: files.value, messages: messages.value.map(m => ({ role: m.role, content: m.parts[0]!.text })) }) })
    const j = await res.json().catch(() => null)
    if (!j?.ok) throw new Error(j?.error || `Request failed (HTTP ${res.status})`)
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text: j.data.text }], tools: j.data.tools || [] })
    lastUsed.value = (models.value.find(m => m.id === j.data.model)?.label || j.data.model) + (j.data.fallback ? ' (fallback)' : '')
    status.value = 'ready'
  } catch (e: any) { error.value = e.message; status.value = 'error' }
}
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar title="Agent chat" icon="i-lucide-message-square">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton :icon="isAdmin ? 'i-lucide-shield-check' : 'i-lucide-shield'" :color="isAdmin ? 'primary' : 'neutral'" variant="ghost" size="sm" :label="isAdmin ? 'Owner' : undefined" aria-label="Owner mode" @click="isAdmin ? logoutAdmin() : (adminOpen = !adminOpen)" />
          <USelect v-if="modelItems.length" v-model="model" :items="modelItems" size="sm" color="neutral" variant="outline" class="w-44" aria-label="Model" />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6 py-8 max-w-3xl">
        <div v-if="!messages.length" class="my-auto text-center space-y-6">
          <img src="/logo-mark.svg" alt="" class="size-12 mx-auto">
          <h1 class="text-3xl font-bold text-highlighted">How can I help you ship?</h1>
          <div class="flex flex-wrap justify-center gap-2">
            <UButton v-for="s in suggestions" :key="s" :label="s" color="neutral" variant="outline" size="sm" class="rounded-full" @click="send(s)" />
          </div>
        </div>
        <UChatMessages v-else :messages="messages" :status="status === 'error' ? 'ready' : status" :assistant="{ variant: 'naked' }" :user="{ variant: 'soft' }" should-auto-scroll>
          <template #content="{ message }">
            <div v-if="(message as any).tools?.length" class="flex flex-col gap-1 mb-2">
              <details v-for="(t, i) in (message as any).tools" :key="i" class="text-xs rounded-md border border-default bg-elevated/50 px-2 py-1">
                <summary class="cursor-pointer text-muted"><UIcon :name="t.error ? 'i-lucide-circle-x' : t.pending ? 'i-lucide-clock' : 'i-lucide-wrench'" class="size-3 align-middle" /> Used tool: <span class="font-mono text-highlighted">{{ t.tool }}</span></summary>
                <pre class="whitespace-pre-wrap break-all mt-1 text-muted">input: {{ JSON.stringify(t.input) }}
{{ t.error ? 'error: ' + t.error : t.pending ? 'Waiting for owner confirmation' : 'result: ' + t.output }}</pre>
                <div v-if="t.pending" class="mt-1"><UButton size="xs" color="primary" :loading="t.busy" label="Confirm and run" @click="confirmTool(t)" /></div>
                <pre v-if="t.done" class="whitespace-pre-wrap break-all mt-1">{{ t.done }}</pre>
              </details>
            </div>
            <p class="whitespace-pre-wrap">{{ message.parts[0]?.text }}</p>
          </template>
        </UChatMessages>
      </UContainer>
    </template>
    <template #footer>
      <UContainer class="pb-4 sm:pb-6 max-w-3xl">
        <form v-if="adminOpen && !isAdmin" class="flex gap-2 mb-3" @submit.prevent="saveAdmin"><UInput v-model="adminInput" type="password" placeholder="Owner token" class="flex-1" autocomplete="off" /><UButton type="submit" label="Unlock" color="neutral" /></form>
        <div v-if="files.length" class="flex flex-wrap gap-1 mb-2"><UBadge v-for="(f, i) in files" :key="f.name" color="neutral" variant="subtle">{{ f.name }} <UIcon name="i-lucide-x" class="cursor-pointer" @click="files.splice(i, 1)" /></UBadge></div>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" icon="i-lucide-triangle-alert" class="mb-3" />
        <UChatPrompt v-model="input" placeholder="Ask about imports, builds, env vars, domains…" variant="subtle" :status="status === 'submitted' ? 'submitted' : 'ready'" @submit="send()">
          <input ref="fileInput" type="file" multiple class="hidden" accept=".txt,.md,.json,.csv,.pdf,.ts,.js,.vue,.html,.css,.py,.yaml,.yml,.toml,text/*,application/pdf" @change="pickFiles">
          <UButton icon="i-lucide-paperclip" color="neutral" variant="ghost" size="sm" aria-label="Attach file" @click="fileInput?.click()" />
          <span v-if="lastUsed" class="text-xs text-muted me-auto">Answered by {{ lastUsed }}</span>
          <UChatPromptSubmit :status="status === 'submitted' ? 'submitted' : 'ready'" color="neutral" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
