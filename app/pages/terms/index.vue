<script setup lang="ts">
import html from '~/content/terms.html?raw'

useSeoMeta({ title: "Terms \u2014 Aibotq.dev", description: "The terms for using Aibotq.dev.", ogTitle: "Terms \u2014 Aibotq.dev", ogDescription: "The terms for using Aibotq.dev.", ogType: 'website', ogUrl: 'https://aibotq.dev/terms/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
useHead({ bodyAttrs: { 'data-page': 'terms' } })
useLegacyScripts(["/app.js"])
</script>
<template><div class="page-root" v-html="html" /></template>
