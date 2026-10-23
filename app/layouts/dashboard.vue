<!-- App shell (from the Nuxt UI dashboard template): collapsible sidebar + panels. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
const open = ref(false)
const { user, load, login, logout } = useSession()
onMounted(() => load())
const close = () => { open.value = false }
const links = [[
  { label: 'Projects', icon: 'i-lucide-layout-grid', to: '/dashboard/', onSelect: close },
  { label: 'New project', icon: 'i-lucide-plus', to: '/new/', onSelect: close },
  { label: 'Agent chat', icon: 'i-lucide-message-square', to: '/chat/', onSelect: close },
  { label: 'Live activity', icon: 'i-lucide-activity', to: '/dashboard/live/', onSelect: close },
], [
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs/' },
  { label: 'Changelog', icon: 'i-lucide-history', to: '/changelog/' },
  { label: 'Help', icon: 'i-lucide-life-buoy', to: '/help/' },
]] satisfies NavigationMenuItem[][]
const groups = [{ id: 'links', label: 'Go to', items: links.flat() }]
const userItems = computed(() => [[{ label: 'Home', icon: 'i-lucide-house', to: '/' }], [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => logout() }]])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar id="app" v-model:open="open" collapsible resizable class="bg-elevated/25" :ui="{ footer: 'lg:border-t lg:border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 px-1">
          <img v-if="collapsed" src="/logo-mark.svg" alt="aibotq.dev" class="size-7">
          <AppLogo v-else />
        </NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />
        <UNavigationMenu :collapsed="collapsed" :items="links[0]" orientation="vertical" tooltip popover />
        <UNavigationMenu :collapsed="collapsed" :items="links[1]" orientation="vertical" tooltip class="mt-auto" />
      </template>
      <template #footer="{ collapsed }">
        <ClientOnly>
          <UDropdownMenu v-if="user" :items="userItems" :content="{ align: 'center', collisionPadding: 12 }">
            <UButton :avatar="{ src: user.avatar, alt: user.login }" :label="collapsed ? undefined : '@' + user.login" color="neutral" variant="ghost" block :square="collapsed" />
          </UDropdownMenu>
          <UButton v-else :label="collapsed ? undefined : 'Sign in with GitHub'" icon="i-simple-icons-github" color="neutral" variant="subtle" block :square="collapsed" @click="login('github', 'login', $route.fullPath)" />
        </ClientOnly>
      </template>
    </UDashboardSidebar>
    <UDashboardSearch :groups="groups" />
    <slot />
  </UDashboardGroup>
</template>
