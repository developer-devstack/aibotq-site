<script setup lang="ts">
import html from '~/content/home.html?raw'
import '~/assets/home.css'
useSeoMeta({ title: "Aibotq.dev \u2014 The platform for shipping AI agents", description: "Aibotq.dev: import a repository, upload a folder or start from a template, configure it, and deploy to the edge. Every push ships to production, every pull request gets a preview.", ogTitle: "Aibotq.dev \u2014 The platform for shipping AI agents", ogDescription: "Aibotq.dev: import a repository, upload a folder or start from a template, configure it, and deploy to the edge. Every push ships to production, every pull request gets a preview.", ogType: 'website', ogUrl: 'https://aibotq.dev', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'home' } })
useLegacyScripts(["/app.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
