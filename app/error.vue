<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()
const nf = props.error?.statusCode === 404
useSeoMeta({ title: nf ? 'Page not found — Aibotq.dev' : 'Error — Aibotq.dev', description: 'That page could not be found on Aibotq.dev.', robots: 'noindex' })
</script>
<template>
  <UApp>
    <AppHeader />
    <UMain>
      <UError :error="{ statusCode: error?.statusCode || 500, statusMessage: nf ? 'Page not found' : 'Something went wrong', message: nf ? 'That page could not be found.' : 'Please try again.' }" :clear="{ label: 'Back home', to: '/' }" />
    </UMain>
    <AppFooter />
  </UApp>
</template>
