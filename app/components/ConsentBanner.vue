<script setup lang="ts">
const { state, read, set, gpc } = useConsent()
const show = ref(false)
onMounted(() => { read(); show.value = state.value === 'unknown' && !gpc() })
function choose(v: boolean) { set(v); show.value = false; if (v) track('pageview') }
</script>
<template>
  <div v-if="show" class="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm rounded-lg border border-default bg-default/95 backdrop-blur p-4 shadow-lg" role="dialog" aria-label="Cookie notice">
    <p class="text-sm text-highlighted font-medium">Help us improve aibotq.dev?</p>
    <p class="mt-1 text-xs text-muted">With your OK we count page views, button clicks and chat <em>topics</em> (never what you type) using a random ID, to suggest docs and templates for you. No ads, no third parties. <NuxtLink to="/privacy/#activity" class="underline">Details</NuxtLink></p>
    <div class="mt-3 flex gap-2">
      <UButton size="sm" label="Allow" @click="choose(true)" />
      <UButton size="sm" color="neutral" variant="subtle" label="No thanks" @click="choose(false)" />
    </div>
  </div>
</template>
