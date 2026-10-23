<script setup lang="ts">
// Layout from the Nuxt UI chat template (UChatMessages + UChatPrompt inside a dashboard panel).
definePageMeta({ layout: 'dashboard' })
const title = 'Agent chat — Aibotq.dev'
const description = 'Ask the aibotq.dev assistant how to import, configure and deploy your AI agent.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev/chat/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })

type Msg = { id: string, role: 'user' | 'assistant', parts: { type: 'text', text: string }[] }
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
const suggestions = ['How do I deploy a Nuxt app?', 'How do preview deployments work?', 'How do I add a custom domain?']
async function send(text?: string) {
  const t = (text ?? input.value).trim(); if (!t || status.value === 'submitted') return
  input.value = ''; error.value = ''
  messages.value.push({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: t }] })
  status.value = 'submitted'
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model.value, messages: messages.value.map(m => ({ role: m.role, content: m.parts[0]!.text })) }) })
    const j = await res.json().catch(() => null)
    if (!j?.ok) throw new Error(j?.error || `Request failed (HTTP ${res.status})`)
    messages.value.push({ id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text: j.data.text }] })
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
            <p class="whitespace-pre-wrap">{{ message.parts[0]?.text }}</p>
          </template>
        </UChatMessages>
      </UContainer>
    </template>
    <template #footer>
      <UContainer class="pb-4 sm:pb-6 max-w-3xl">
        <UAlert v-if="error" color="error" variant="subtle" :title="error" icon="i-lucide-triangle-alert" class="mb-3" />
        <UChatPrompt v-model="input" placeholder="Ask about imports, builds, env vars, domains…" variant="subtle" :status="status === 'submitted' ? 'submitted' : 'ready'" @submit="send()">
          <span v-if="lastUsed" class="text-xs text-muted me-auto">Answered by {{ lastUsed }}</span>
          <UChatPromptSubmit :status="status === 'submitted' ? 'submitted' : 'ready'" color="neutral" />
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
