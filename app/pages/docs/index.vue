<script setup lang="ts">
import html from '~/content/docs.html?raw'

useSeoMeta({ title: "Docs \u2014 Aibotq.dev", description: "How to connect a source, configure, and deploy on Aibotq.dev \u2014 plus the build-pipeline contract, JSON API and self-hosting setup.", ogTitle: "Docs \u2014 Aibotq.dev", ogDescription: "How to connect a source, configure, and deploy on Aibotq.dev \u2014 plus the build-pipeline contract, JSON API and self-hosting setup.", ogType: 'website', ogUrl: 'https://aibotq.dev/docs/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'docs' } })
useLegacyScripts(["/app.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
