<script setup lang="ts">
import raw from '~/content/docs.html?raw'
const page = splitLegacy(raw)
useSeoMeta({ title: "Docs \u2014 Aibotq.dev", description: "How to connect a source, configure, and deploy on Aibotq.dev \u2014 plus the build-pipeline contract, JSON API and self-hosting setup.", ogTitle: "Docs \u2014 Aibotq.dev", ogDescription: "How to connect a source, configure, and deploy on Aibotq.dev \u2014 plus the build-pipeline contract, JSON API and self-hosting setup.", ogType: 'website', ogUrl: 'https://aibotq.dev/docs/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
</script>
<template>
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <p class="text-sm font-semibold text-highlighted mb-3">On this page</p>
          <UNavigationMenu :items="page.toc" orientation="vertical" variant="link" />
        </UPageAside>
      </template>
      <UPageHeader headline="Documentation" :title="page.title" :description="page.lead" />
      <UPageBody><ForYou class="!px-0 !py-0 mb-8" /><ProseHtml :html="page.body" /></UPageBody>
    </UPage>
  </UContainer>
</template>
