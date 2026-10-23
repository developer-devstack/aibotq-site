<script setup lang="ts">
import raw from '~/content/terms.html?raw'
const page = splitLegacy(raw)
useSeoMeta({ title: "Terms \u2014 Aibotq.dev", description: "The terms for using Aibotq.dev.", ogTitle: "Terms \u2014 Aibotq.dev", ogDescription: "The terms for using Aibotq.dev.", ogType: 'website', ogUrl: 'https://aibotq.dev/terms/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
</script>
<template>
  <UContainer class="max-w-4xl">
    <UPage>
      <UPageHeader headline="Terms" :title="page.title" :description="page.lead || page.updated" />
      <UPageBody>
        <p v-if="page.lead && page.updated" class="text-sm text-muted">{{ page.updated }}</p>
        <ProseHtml :html="page.body" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
