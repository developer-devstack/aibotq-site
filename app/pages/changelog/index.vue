<script setup lang="ts">
// Mirrors the official nuxt-ui-templates/changelog layout (UChangelogVersions timeline: sticky date, version badge, image, release body).
// Every entry is taken from this repo's real commit / PR history.
const title = 'Changelog — Aibotq.dev'
const description = 'What changed on aibotq.dev, release by release.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev/changelog/', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })
const versions = [
  { badge: 'v0.13.0', date: '2026-10-23', title: 'Mobile hero fix and live terminal',
    description: 'The hero looks right on Android and the terminal card plays the deploy.',
    items: ['Chip video now has the page colour and a soft round fade built into the video, so there is no black square on Android Chrome', 'Chip sits above the terminal on phones and never covers the buttons', 'Terminal types the command and shows each build step in turn when it scrolls into view', 'Reduced-motion users see the full output at once'] },
  { badge: 'v0.12.1', date: '2026-10-23', title: 'Loading overlay removed', to: 'https://github.com/thanabartbb/aibotq-site/pull/14',
    description: 'The full-screen loading video is gone; pages appear immediately.',
    items: ['Removed the overlay and its video files'] },
  { badge: 'v0.12.0', date: '2026-10-23', title: 'Chip video in the hero', to: 'https://github.com/thanabartbb/aibotq-site/pull/13',
    description: 'A small decorative chip animation on the homepage.',
    items: ['Shows a still image for reduced-motion users'] },
  { badge: 'v0.11.0', date: '2026-10-23', title: 'Loading overlay', to: 'https://github.com/thanabartbb/aibotq-site/pull/12',
    description: 'A short video while the page loads (removed in v0.12.1).',
    items: ['Capped at 2.5 seconds'] },
  { badge: 'v0.10.0', date: '2026-10-23', title: 'AI Gateway', to: 'https://github.com/thanabartbb/aibotq-site/pull/11',
    description: 'Chat models now go through Vercel AI Gateway.',
    items: ['More models in the picker', 'Direct Anthropic/OpenAI kept as fallback'] },
  { badge: 'v0.9.0', date: '2026-10-23', title: 'Self-hosted deploy pipeline', to: 'https://github.com/thanabartbb/aibotq-site/pull/10',
    description: 'Builds run in our own sandbox and are hosted on aibotq.dev.',
    items: ['Clone, install and build in a container', 'Sites served at /sites/<name>/', 'GitHub webhook set up automatically'] },
  { badge: 'v0.8.0', date: '2026-10-23', title: 'Code sandbox in chat', to: 'https://github.com/thanabartbb/aibotq-site/pull/8',
    description: 'Signed-in users can run code and commands from chat.',
    items: ['Docker Cloud Sandboxes first, Cloudflare Sandbox as fallback', 'Sandboxes delete themselves after 10 idle minutes', 'No internet in sandboxes for non-owners'] },
  { badge: 'v0.7.0', date: '2026-10-23', title: 'GitHub login and owner mode', to: 'https://github.com/thanabartbb/aibotq-site/pull/4',
    description: 'Sign in with GitHub; owners get extra tools.',
    items: ['GitHub sign-in at /auth/github', 'Owner list is configurable', 'Real tool calling in chat'] },
  { badge: 'v0.6.0', date: '2026-10-23', title: 'Multi-model agent chat', image: '/changelog/nuxtui-chat-desktop.webp', to: 'https://aibotq.dev/chat',
    description: 'Agent chat now answers for real and is provider-agnostic.',
    items: ['Pick Claude Haiku, Claude Sonnet, GPT-4o mini, GPT-4.1 mini or GPT-5 mini from the chat header', 'Automatic fallback to the other provider if a model fails', 'Any OpenAI-compatible provider can be added by configuration', 'Projects database (D1) is now provisioned'] },
  { badge: 'v0.5.0', date: '2026-10-23', title: 'Nuxt UI redesign', image: '/changelog/nuxtui-home-desktop.webp', to: 'https://github.com/thanabartbb/aibotq-site/pull/3',
    description: 'The whole site restyled with Nuxt UI v4, composed from the official templates.',
    items: ['Landing from the SaaS template', 'Dashboard shell for projects and the new-project flow', 'Docs, chat and changelog layouts', 'Black and neutral palette with orange only on the logo and primary actions'] },
  { badge: 'v0.4.0', date: '2026-10-23', title: 'Server-rendered Nuxt app', image: '/changelog/nuxt-home-desktop.webp', to: 'https://github.com/thanabartbb/aibotq-site/pull/2',
    description: 'Rebuilt as a Nuxt 4 SSR app on Cloudflare Workers.',
    items: ['Per-page SEO metadata with useSeoMeta', 'API served through Nitro on the same Worker'] },
  { badge: 'v0.3.0', date: '2026-10-23', title: 'New brand mark', image: '/changelog/brand-home-desktop.webp',
    description: 'New logo and type.',
    items: ['SVG logo mark, favicons and apple-touch icon', 'Black and orange logo, upright wordmark', 'Upright fonts everywhere — no italic or skewed text'] },
  { badge: 'v0.2.0', date: '2026-10-23', title: 'Backend API', image: '/changelog/new-v2-desktop.webp', to: 'https://github.com/thanabartbb/aibotq-site/pull/1',
    description: 'First backend for importing and deploying projects.',
    items: ['GitHub sign-in, repository import, templates, projects and deployments', 'Encrypted environment variables', 'Frontend wired to the API with honest setup errors', 'Redesigned 3-step new-project flow'] },
  { badge: 'v0.1.0', date: '2026-10-23', title: 'First release', image: '/changelog/live-desktop.webp',
    description: 'aibotq.dev goes live.',
    items: ['Home page and new-project page on Cloudflare Workers', 'Mobile layout fixes'] },
]
</script>

<template>
  <div>
    <UContainer>
      <UPageHeader headline="Changelog" title="What's new on aibotq.dev" description="Every release of the platform, newest first." :ui="{ root: 'border-b-0 pb-0' }" />
    </UContainer>
    <UContainer class="max-w-5xl">
      <UChangelogVersions :ui="{ root: 'py-12 sm:py-16', indicator: 'inset-y-0', beam: 'bg-primary' }">
        <UChangelogVersion v-for="v in versions" :key="v.badge" :title="v.title" :description="v.description" :date="v.date" :image="v.image" :to="v.to" :target="v.to?.startsWith('http') ? '_blank' : undefined"
          :badge="{ label: v.badge, color: 'neutral', variant: 'outline' }"
          :ui="{ root: 'flex items-start', container: 'max-w-xl min-w-0', header: 'border-b border-default pb-4', title: 'text-2xl', date: 'text-xs/9 text-highlighted font-mono', image: 'rounded-lg border border-default' }">
          <template #body>
            <ul class="list-disc ps-5 space-y-1 text-sm text-muted">
              <li v-for="i in v.items" :key="i">{{ i }}</li>
            </ul>
          </template>
        </UChangelogVersion>
      </UChangelogVersions>
    </UContainer>
  </div>
</template>
