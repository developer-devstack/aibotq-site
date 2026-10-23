<script setup lang="ts">
import html from '~/content/help.html?raw'

useSeoMeta({ title: "Help \u2014 Aibotq.dev", description: "Quick start and answers to common Aibotq.dev questions: sign-in, repositories, uploads, deploy failures and webhooks.", ogTitle: "Help \u2014 Aibotq.dev", ogDescription: "Quick start and answers to common Aibotq.dev questions: sign-in, repositories, uploads, deploy failures and webhooks.", ogType: 'website', ogUrl: 'https://aibotq.dev/help/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'help' } })
useLegacyScripts(["/app.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
