<script setup lang="ts">
// Purely visual splash. SSR content renders underneath; CSS auto-hides at 2.5s even without JS.
const hidden = ref(false)
const reduced = ref(false)
onMounted(() => {
  reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const done = () => setTimeout(() => (hidden.value = true), 600)
  if (document.readyState === 'complete') done()
  else window.addEventListener('load', done, { once: true })
  setTimeout(() => (hidden.value = true), 2500)
})
</script>

<template>
  <div v-if="!hidden" class="aq-loading" aria-hidden="true">
    <img v-if="reduced" src="/loading/loading-poster.jpg" alt="" class="aq-loading-media">
    <video
      v-else
      class="aq-loading-media"
      autoplay muted loop playsinline preload="auto"
      poster="/loading/loading-poster.jpg"
    >
      <source src="/loading/loading.webm" type="video/webm">
      <source src="/loading/loading.mp4" type="video/mp4">
    </video>
  </div>
</template>

<style scoped>
.aq-loading {
  position: fixed; inset: 0; z-index: 9999; background: #000;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
  animation: aq-fade 0.4s ease 2.1s forwards;
}
.aq-loading-media { width: min(90vw, 960px); height: auto; max-height: 90vh; object-fit: contain; }
@keyframes aq-fade { to { opacity: 0; visibility: hidden; } }
@media (prefers-reduced-motion: reduce) {
  .aq-loading { animation-duration: 0.01s; }
  .aq-loading-media { animation: none; }
}
</style>
