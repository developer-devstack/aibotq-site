<script setup lang="ts">
// Static terminal mock for a calm, readable homepage (no typing loop).
const lines = [
  { kind: 'cmd', text: 'git push origin main' },
  { kind: 'muted', text: '→ aibotq.dev · build queued' },
  { kind: 'ok', parts: [['detected ', ''], ['Nuxt', 'text-highlighted'], [' · npm run build', '']] },
  { kind: 'ok', parts: [['built in 38s', '']] },
  { kind: 'ok', parts: [['live → ', ''], ['https://my-agent.aibotq.dev', 'text-primary']] }
] as const
</script>

<template>
  <pre class="p-5 text-sm font-mono leading-7 text-toned overflow-x-auto"><span class="text-primary">$</span> <span>{{ lines[0].text }}</span>
<template v-for="(l, i) in lines.slice(1)" :key="i"><template v-if="l.kind === 'muted'"><span class="text-muted">{{ l.text }}</span></template><template v-else><span class="text-success">✔</span> <span v-for="(p, j) in l.parts" :key="j" :class="p[1]">{{ p[0] }}</span></template>{{ i < lines.length - 2 ? '\n' : '' }}</template></pre>
</template>
