<script setup lang="ts">
// Decorative hero visual (aria-hidden). To swap in a transparent version: replace the files below
// (hero-chip.webm = VP9 with alpha, hero-chip.mp4 = fallback) and pass :transparent="true" to drop the edge mask.
const props = withDefaults(defineProps<{ transparent?: boolean }>(), { transparent: false })
const src = { webm: '/loading/hero-chip.webm', mp4: '/loading/hero-chip.mp4', poster: '/loading/hero-chip-poster.jpg' }
const reduced = ref(false)
onMounted(() => { reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches })
</script>

<template>
  <div class="hero-chip" :class="{ 'hero-chip--masked': !props.transparent }" aria-hidden="true">
    <img v-if="reduced" :src="src.poster" alt="" class="hero-chip__media">
    <video v-else class="hero-chip__media" autoplay muted loop playsinline preload="metadata" disablepictureinpicture :poster="src.poster">
      <source :src="src.webm" type="video/webm">
      <source :src="src.mp4" type="video/mp4">
    </video>
  </div>
</template>

<style scoped>
.hero-chip { pointer-events: none; user-select: none; aspect-ratio: 1 / 1; }
.hero-chip__media { width: 100%; height: 100%; object-fit: contain; display: block; }
/* Opaque black source: background baked to page colour (#18181b) + soft radial edges so it melts into the page background */
.hero-chip--masked {
  -webkit-mask-image: radial-gradient(closest-side, #000 70%, transparent 100%);
  mask-image: radial-gradient(closest-side, #000 70%, transparent 100%);
}
</style>
