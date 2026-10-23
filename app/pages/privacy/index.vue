<script setup lang="ts">
import raw from '~/content/privacy.html?raw'
const page = splitLegacy(raw)
useSeoMeta({ title: "Privacy \u2014 Aibotq.dev", description: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogTitle: "Privacy \u2014 Aibotq.dev", ogDescription: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogType: 'website', ogUrl: 'https://aibotq.dev/privacy/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
</script>
<template>
  <UContainer class="max-w-4xl">
    <UPage>
      <UPageHeader headline="Privacy" :title="page.title" :description="page.lead || page.updated" />
      <UPageBody>
        <p v-if="page.lead && page.updated" class="text-sm text-muted">{{ page.updated }}</p>
        <ProseHtml :html="page.body" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
