<script setup lang="ts">
import html from '~/content/privacy.html?raw'

useSeoMeta({ title: "Privacy \u2014 Aibotq.dev", description: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogTitle: "Privacy \u2014 Aibotq.dev", ogDescription: "What data Aibotq.dev stores, why, who it is shared with, and how to remove it.", ogType: 'website', ogUrl: 'https://aibotq.dev/privacy/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'privacy' } })
useLegacyScripts(["/app.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
