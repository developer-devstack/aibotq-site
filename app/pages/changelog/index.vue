<script setup lang="ts">
// Layout from the Nuxt UI changelog template (UChangelogVersions). Entries are this site's real release history.
const title = 'Changelog — Aibotq.dev'
const description = 'What changed on aibotq.dev, release by release.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev/changelog/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
const versions = [
  { title: 'Nuxt UI redesign', date: '2026-10-23', badge: 'v0.5', description: 'The whole site now runs on Nuxt UI v4 and Tailwind v4: new landing, dashboard shell for projects and new-project flow, agent chat, docs layout and this changelog.' },
  { title: 'Server-rendered Nuxt app', date: '2026-10-23', badge: 'v0.4', description: 'Rebuilt as a Nuxt 4 SSR app on Cloudflare Workers with per-page SEO metadata and the API served through Nitro.' },
  { title: 'New brand mark', date: '2026-10-23', badge: 'v0.3', description: 'Black and orange logo mark, upright wordmark and new favicons. Upright fonts everywhere.' },
  { title: 'Backend API', date: '2026-10-23', badge: 'v0.2', description: 'GitHub sign-in, repository import, templates, projects, deployments and encrypted environment variables — with honest setup errors when something is not configured.' },
  { title: 'First release', date: '2026-10-23', badge: 'v0.1', description: 'Static home page and the first version of the new-project flow.' },
]
</script>

<template>
  <UContainer>
    <UPageHeader headline="Changelog" title="What's new on aibotq.dev" description="Every release of the platform, newest first." />
    <UChangelogVersions :indicator-motion="false" :ui="{ root: 'py-12 sm:py-16' }">
      <UChangelogVersion v-for="v in versions" :key="v.badge" v-bind="v" :badge="{ label: v.badge, color: 'neutral', variant: 'subtle' }" :ui="{ container: 'max-w-xl min-w-0', date: 'text-xs/9 text-highlighted font-mono' }" />
    </UChangelogVersions>
  </UContainer>
</template>
