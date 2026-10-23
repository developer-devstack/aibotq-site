<script setup lang="ts">
import raw from '~/content/help.html?raw'
const page = splitLegacy(raw)
useSeoMeta({ title: "Help \u2014 Aibotq.dev", description: "Quick start and answers to common Aibotq.dev questions: sign-in, repositories, uploads, deploy failures and webhooks.", ogTitle: "Help \u2014 Aibotq.dev", ogDescription: "Quick start and answers to common Aibotq.dev questions: sign-in, repositories, uploads, deploy failures and webhooks.", ogType: 'website', ogUrl: 'https://aibotq.dev/help/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
</script>
<template>
  <UContainer class="max-w-4xl">
    <UPage>
      <UPageHeader headline="Help" :title="page.title" :description="page.lead || page.updated" />
      <UPageBody>
        <p v-if="page.lead && page.updated" class="text-sm text-muted">{{ page.updated }}</p>
        <ProseHtml :html="page.body" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
