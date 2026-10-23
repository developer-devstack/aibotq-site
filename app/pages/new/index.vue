<script setup lang="ts">
import html from '~/content/new.html?raw'

useSeoMeta({ title: "New Project \u2014 Aibotq.dev", description: "Import a Git repository, upload a folder or start from a template, configure it and deploy to the edge on Aibotq.dev.", ogTitle: "New Project \u2014 Aibotq.dev", ogDescription: "Import a Git repository, upload a folder or start from a template, configure it and deploy to the edge on Aibotq.dev.", ogType: 'website', ogUrl: 'https://aibotq.dev/new/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'new' } })
useLegacyScripts(["/app.js", "/new/new.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
