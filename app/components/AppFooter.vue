<script setup lang="ts">
const columns = [
  { label: 'Product', children: [{ label: 'New project', to: '/new/' }, { label: 'Dashboard', to: '/dashboard/' }, { label: 'Pricing', to: '/#pricing' }] },
  { label: 'Resources', children: [{ label: 'Docs', to: '/docs/' }, { label: 'Help', to: '/help/' }, { label: 'Changelog', to: '/changelog/' }, { label: 'llms.txt', to: '/llms.txt', target: '_blank' }] },
  { label: 'Legal', children: [{ label: 'Privacy', to: '/privacy/' }, { label: 'Terms', to: '/terms/' }] },
]
</script>

<template>
  <USeparator class="h-px" />
  <UFooter :ui="{ top: 'border-b border-default' }">
    <template #top>
      <UContainer>
        <div class="grid gap-10 lg:grid-cols-4">
          <div class="space-y-3">
            <AppLogo />
            <p class="text-sm text-muted max-w-xs">The platform for shipping AI agents — from repository to the edge.</p>
          </div>
          <UFooterColumns :columns="columns" class="lg:col-span-3" />
        </div>
      </UContainer>
    </template>
    <template #left>
      <p class="text-muted text-sm">© {{ new Date().getFullYear() }} aibotq.dev</p>
    </template>
    <template #right>
      <UColorModeButton />
      <UButton to="https://github.com/thanabartbb/aibotq-site" target="_blank" icon="i-simple-icons-github" color="neutral" variant="ghost" aria-label="GitHub" />
    </template>
  </UFooter>
</template>
