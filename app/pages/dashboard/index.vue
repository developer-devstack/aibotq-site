<script setup lang="ts">
import html from '~/content/dashboard.html?raw'

useSeoMeta({ title: "Dashboard \u2014 Aibotq.dev", description: "Your Aibotq.dev projects and deployments.", ogTitle: "Dashboard \u2014 Aibotq.dev", ogDescription: "Your Aibotq.dev projects and deployments.", ogType: 'website', ogUrl: 'https://aibotq.dev/dashboard/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary', robots: "noindex" })
useHead({ bodyAttrs: { 'data-page': 'dashboard' } })
useLegacyScripts(["/app.js", "/dashboard/dashboard.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
