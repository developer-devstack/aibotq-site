<script setup lang="ts">
// Live terminal: full text is SSR-rendered (SEO); the client animates it once
// scrolled into view. prefers-reduced-motion keeps everything shown at once.
const lines = [
  { kind: 'cmd', text: 'git push origin main' },
  { kind: 'muted', text: '→ aibotq.dev · build queued' },
  { kind: 'ok', parts: [['detected ', ''], ['Nuxt', 'text-highlighted'], [' · npm run build', '']] },
  { kind: 'ok', parts: [['built in 38s', '']] },
  { kind: 'ok', parts: [['live → ', ''], ['https://my-agent.aibotq.dev', 'text-primary']] }
] as const

const root = ref<HTMLElement>()
const animating = ref(false)
const typed = ref(0) // chars of command typed
const shown = ref(lines.length) // lines visible (SSR: all)
let timers: ReturnType<typeof setTimeout>[] = []
const wait = (ms: number) => new Promise<void>(r => timers.push(setTimeout(r, ms)))

async function play() {
  const cmd = lines[0].text
  while (true) {
    animating.value = true
    shown.value = 0
    typed.value = 0
    await wait(500)
    for (let i = 1; i <= cmd.length; i++) { typed.value = i; await wait(55 + Math.random() * 45) }
    shown.value = 1
    for (let i = 2; i <= lines.length; i++) { await wait(i === 2 ? 450 : 700); shown.value = i }
    animating.value = false
    await wait(6000)
  }
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
  const io = new IntersectionObserver((e) => {
    if (e[0]?.isIntersecting) { io.disconnect(); play() }
  }, { threshold: 0.4 })
  if (root.value) io.observe(root.value)
  onBeforeUnmount(() => { io.disconnect(); timers.forEach(clearTimeout) })
})
</script>

<template>
  <pre ref="root" class="p-5 text-sm font-mono leading-7 text-toned overflow-x-auto"><span class="text-primary">$</span> <span>{{ animating && shown === 0 ? lines[0].text.slice(0, typed) : lines[0].text }}</span><span v-if="shown === 0" class="term-cursor" aria-hidden="true" />
<template v-for="(l, i) in lines.slice(1)" :key="i"><span :class="i + 1 < shown ? '' : 'term-hidden'"><template v-if="l.kind === 'muted'"><span class="text-muted">{{ l.text }}</span></template><template v-else><span class="text-success">✔</span> <span v-for="(p, j) in l.parts" :key="j" :class="p[1]">{{ p[0] }}</span></template></span><span v-if="i + 2 === lines.length && shown === lines.length" class="term-cursor ms-1" aria-hidden="true" /><span v-else-if="i + 1 === shown - 1 && shown < lines.length && shown > 0" class="term-cursor ms-1" aria-hidden="true" />{{ i < lines.length - 2 ? '\n' : '' }}</template></pre>
</template>

<style scoped>
.term-hidden { visibility: hidden; }
.term-cursor { display: inline-block; width: 0.55em; height: 1.1em; vertical-align: -0.2em; background: currentColor; opacity: .7; animation: term-blink 1s steps(1) infinite; }
@keyframes term-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .term-cursor { animation: none; } }
</style>
