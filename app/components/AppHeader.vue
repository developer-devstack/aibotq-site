<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
const route = useRoute()
const { user, load, login, logout } = useSession()
onMounted(() => load())
const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Platform', to: '/', active: route.path === '/' },
  { label: 'New project', to: '/new/', active: route.path.startsWith('/new') },
  { label: 'Dashboard', to: '/dashboard/', active: route.path.startsWith('/dashboard') },
  { label: 'Docs', to: '/docs/', active: route.path.startsWith('/docs') },
  { label: "Chat", to: "/chat/", active: route.path.startsWith("/chat") },
  { label: "Changelog", to: "/changelog/", active: route.path.startsWith("/changelog") },
])
const userMenu = computed(() => [[{ label: user.value?.login || 'Account', type: 'label' as const }], [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard/' },
  { label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => logout() },
]])
</script>

<template>
  <UHeader to="/" title="aibotq.dev">
    <template #title><AppLogo /></template>
    <UNavigationMenu :items="items" variant="link" />
    <template #right>
      <UColorModeButton />
      <UButton to="https://github.com/thanabartbb/aibotq-site" target="_blank" icon="i-simple-icons-github" color="neutral" variant="ghost" aria-label="GitHub" />
      <ClientOnly>
        <UDropdownMenu v-if="user" :items="userMenu">
          <UButton color="neutral" variant="ghost" :avatar="{ src: user.avatar, alt: user.login }" :label="user.login" class="hidden sm:inline-flex" />
        </UDropdownMenu>
        <template v-else>
          <UButton label="Log in" color="neutral" variant="ghost" class="hidden sm:inline-flex" @click="login('github', 'login', '/dashboard/')" />
          <UButton label="Sign up" trailing-icon="i-lucide-arrow-right" class="hidden sm:inline-flex" @click="login('github', 'signup', '/new/?step=1')" />
        </template>
      </ClientOnly>
    </template>
    <template #body>
      <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
      <USeparator class="my-6" />
      <UButton v-if="!user" label="Sign up with GitHub" icon="i-simple-icons-github" block @click="login('github', 'signup', '/new/?step=1')" />
      <UButton v-else label="Log out" color="neutral" variant="subtle" block @click="logout()" />
    </template>
  </UHeader>
</template>
