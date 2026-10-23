<script setup lang="ts">
import raw from '~/content/privacy.html?raw'
const page = splitLegacy(raw)
const { state, read, set } = useConsent()
onMounted(read)
useSeoMeta({ title: "Privacy \u2014 Aibotq.dev", description: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogTitle: "Privacy \u2014 Aibotq.dev", ogDescription: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogType: 'website', ogUrl: 'https://aibotq.dev/privacy/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
</script>
<template>
  <UContainer class="max-w-4xl">
    <UPage>
      <UPageHeader headline="Privacy" :title="page.title" :description="page.lead || page.updated" />
      <UPageBody>
        <p v-if="page.lead && page.updated" class="text-sm text-muted">{{ page.updated }}</p>
        <ProseHtml :html="page.body" />
        <section id="activity" class="mt-10 rounded-lg border border-default p-5">
          <h2 class="text-lg font-semibold text-highlighted">Activity &amp; personalisation</h2>
          <p class="mt-2 text-sm text-muted">Only if you click <b>Allow</b>, we store: a random visitor ID (cookie <code>aq_vid</code>), the page path you open (no query string), which main buttons you click, and the <em>category</em> of your chat questions (e.g. "deploy", "git"). We never store what you type, your IP address or your browser details. Data is kept 30 days, used only to show suggestions to you and aggregate stats to the site owner, and never shared. Browser "Do Not Track" / Global Privacy Control is respected.</p>
          <p class="mt-3 text-sm">Current choice: <b>{{ state === 'yes' ? 'Allowed' : state === 'no' ? 'Opted out' : 'Not chosen (not tracked)' }}</b></p>
          <div class="mt-3 flex gap-2">
            <UButton size="sm" label="Allow" :disabled="state === 'yes'" @click="set(true)" />
            <UButton size="sm" color="neutral" variant="subtle" label="Opt out" :disabled="state === 'no'" @click="set(false)" />
          </div>
        </section>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
