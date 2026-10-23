<script setup lang="ts">
// Suggestions based on this visitor's own recent activity (server: /api/activity/suggest).
const { state } = useConsent()
const data = ref<{ personalized: boolean, interests: string[], items: { title: string, to: string, kind: string, reason?: string }[] } | null>(null)
async function load() { try { data.value = await aq('/activity/suggest') } catch { data.value = null } }
onMounted(load)
watch(state, load)
const ICON: Record<string, string> = { doc: 'i-lucide-book-open', template: 'i-lucide-layout-template', prompt: 'i-lucide-message-square' }
</script>
<template>
  <section v-if="data?.items?.length" class="mx-auto w-full max-w-(--ui-container) px-4 sm:px-6 lg:px-8 py-10">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-lg font-semibold text-highlighted">{{ data.personalized ? 'Picked for you' : 'Get started' }}</h2>
      <span v-if="data.personalized" class="text-xs text-muted">Based on your recent visits: {{ data.interests.join(', ') }}</span>
      <span v-else-if="state !== 'yes'" class="text-xs text-muted">Allow activity in the cookie notice to get personal picks</span>
    </div>
    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="it in data.items" :key="it.title" :to="it.to" data-track="suggest" class="group flex items-center gap-3 rounded-lg border border-default p-3 hover:border-primary/60 transition">
        <UIcon :name="ICON[it.kind] || 'i-lucide-arrow-right'" class="size-4 text-muted group-hover:text-primary" />
        <span class="text-sm text-default">{{ it.title }}</span>
        <span class="ml-auto text-[10px] uppercase tracking-wide text-dimmed">{{ it.kind }}</span>
      </NuxtLink>
    </div>
  </section>
</template>
