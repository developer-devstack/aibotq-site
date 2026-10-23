<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()
const nf = props.error?.statusCode === 404
useSeoMeta({ title: nf ? 'Page not found — Aibotq.dev' : 'Error — Aibotq.dev', description: 'That page could not be found on Aibotq.dev.', robots: 'noindex' })
useHead({ bodyAttrs: { 'data-page': '404' } })
useLegacyScripts(['/app.js'])
</script>
<template><div><div id="site-nav"></div><main class="page"><div class="wrap" style="padding:120px 0;text-align:center">
<h1 style="font-family:'Inter Tight';font-weight:800;font-size:64px;margin:0">{{ error?.statusCode || 500 }}</h1>
<p style="color:#a3a3ad">{{ nf ? 'That page could not be found.' : 'Something went wrong.' }}</p>
<a class="btn p" href="/">Back home</a></div></main><div id="site-footer"></div></div></template>
