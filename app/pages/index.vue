<script setup lang="ts">
const title = 'Aibotq.dev — The platform for shipping AI agents'
const description = 'Aibotq.dev: import a repository, upload a folder or start from a template, configure it, and deploy to the edge. Every push ships to production, every pull request gets a preview.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, ogType: 'website', ogUrl: 'https://aibotq.dev', ogImage: 'https://aibotq.dev/icon-512.png', twitterCard: 'summary' })

const frameworks = [
  { icon: 'i-simple-icons-nextdotjs', label: 'Next.js' },
  { icon: 'i-simple-icons-nuxt', label: 'Nuxt' },
  { icon: 'i-simple-icons-expo', label: 'Expo' },
  { icon: 'i-simple-icons-astro', label: 'Astro' },
  { icon: 'i-simple-icons-vite', label: 'Vite' },
  { icon: 'i-simple-icons-svelte', label: 'SvelteKit' },
  { icon: 'i-simple-icons-html5', label: 'Static HTML' },
]
const features = [
  { icon: 'i-lucide-git-branch', title: 'Git, folder or template', description: 'Pick a GitHub repo, upload a folder or zip, or generate a new repo from a template.' },
  { icon: 'i-lucide-scan-search', title: 'Framework detection', description: 'Build command and output directory are read straight from your project.' },
  { icon: 'i-lucide-terminal', title: 'Live build logs', description: 'Real log lines stream in as the pipeline runs. If it fails, you see why.' },
  { icon: 'i-lucide-git-pull-request', title: 'Preview per PR', description: 'Every pull request gets its own URL to review before merging.' },
  { icon: 'i-lucide-lock-keyhole', title: 'Encrypted env vars', description: 'Values are encrypted at rest and never sent back to the browser.' },
  { icon: 'i-lucide-globe', title: 'Custom domains', description: 'Point your own domain and get HTTPS issued automatically.' },
]
const steps = [
  { icon: 'i-simple-icons-github', title: '1 · Connect', description: 'Sign in with GitHub and choose a repository.' },
  { icon: 'i-lucide-sliders-horizontal', title: '2 · Configure', description: 'Name, framework, build command and env vars.' },
  { icon: 'i-lucide-rocket', title: '3 · Deploy', description: 'Watch the build and get a live URL on the edge.' },
  { icon: 'i-lucide-refresh-cw', title: '4 · Iterate', description: 'Every push ships again automatically.' },
]
const plans = [
  { title: 'Hobby', description: 'Personal projects and experiments.', price: 'Free', features: ['Preview per pull request', 'aibotq.dev subdomain', 'Live build logs'], button: { label: 'Start for free', to: '/new/' } },
  { title: 'Pro', description: 'For agents in production.', price: 'TBD', highlight: true, scale: true, badge: 'Price not final', features: ['Custom domains', 'More builds per month', 'Priority pipeline'], button: { label: 'Go Pro', to: '/new/' } },
  { title: 'Team', description: 'Ship together.', price: 'TBD', badge: 'Price not final', features: ['Shared projects', 'Roles & access', 'Support'], button: { label: 'Contact', color: 'neutral' as const, variant: 'subtle' as const, to: '/help/' } },
]
const domainLog = `$ aibotq domains add agent.example.com
✔ CNAME found
✔ SSL certificate issued
✔ live at https://agent.example.com   (example)`
</script>

<template>
  <div>
    <UPageHero
      orientation="horizontal"
      :ui="{ container: 'py-20 sm:py-28 lg:py-32', title: 'text-5xl sm:text-7xl' }"
    >
      <template #links>
        <div class="flex w-full items-center gap-4">
          <div class="flex min-w-0 flex-1 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <UButton label="Start deploying" to="/new/" data-track="hero_start" trailing-icon="i-lucide-arrow-right" size="xl" class="max-w-full" :ui="{ label: 'whitespace-normal text-start' }" />
            <UButton label="Read the docs" to="/docs/" data-track="hero_docs" color="neutral" variant="subtle" size="xl" icon="i-lucide-book-open" class="max-w-full" :ui="{ label: 'whitespace-normal text-start' }" />
          </div>
          <HeroChip class="w-[130px] shrink-0 sm:w-40 lg:hidden" />
        </div>
      </template>
      <template #headline>
        <UBadge label="Now building on the edge" color="neutral" variant="outline" icon="i-lucide-zap" class="rounded-full" />
      </template>
      <template #title>
        The platform for shipping AI agents
      </template>
      <template #description>
        Import a repo, drop a folder or start from a template. Aibotq.dev builds it, puts it on the edge and gives every pull request its own preview.
      </template>
      <div>
      <HeroChip class="hidden lg:block lg:w-80 lg:mx-auto lg:-mb-8" />
      <UCard variant="subtle" :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden shadow-2xl shadow-black/40">
        <div class="flex items-center gap-1.5 px-4 py-3 border-b border-default">
          <span class="size-2.5 rounded-full bg-error" /><span class="size-2.5 rounded-full bg-warning" /><span class="size-2.5 rounded-full bg-success" />
          <span class="ms-3 text-xs text-muted font-mono">~/my-agent</span>
        </div>
        <HeroTerminal />
      </UCard>
      </div>
    </UPageHero>

    <UPageSection title="Works with the frameworks you already use" :ui="{ container: 'py-12 sm:py-16 lg:py-16', title: 'text-base sm:text-lg font-medium text-muted' }">
      <div class="flex flex-wrap justify-center gap-3">
        <UBadge v-for="f in frameworks" :key="f.label" :icon="f.icon" :label="f.label" color="neutral" variant="outline" size="xl" class="rounded-full px-4" />
      </div>
    </UPageSection>

    <UPageSection
      id="features"
      headline="Platform"
      title="Everything you need to ship an agent"
      description="The building blocks, already wired together. No YAML, no servers to babysit."
    >
      <UPageGrid>
        <UPageCard v-for="f in features" :key="f.title" v-bind="f" spotlight spotlight-color="neutral" />
      </UPageGrid>
    </UPageSection>

    <UPageSection
      headline="Workflow"
      title="From repo to live in four moves"
      description="The same flow every time, whether it is your first project or your fiftieth."
      class="bg-elevated/30"
    >
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UPageCard v-for="s in steps" :key="s.title" v-bind="s" variant="soft" />
      </div>
    </UPageSection>

    <UPageSection
      headline="Custom domains"
      title="Your domain. Your brand."
      description="Add a domain, set one DNS record, and the certificate is issued for you. Subdomains on aibotq.dev work out of the box."
      orientation="horizontal"
      :features="[{ icon: 'i-lucide-check', title: 'One CNAME record' }, { icon: 'i-lucide-shield-check', title: 'Automatic HTTPS' }, { icon: 'i-lucide-globe', title: 'Free *.aibotq.dev subdomain' }]"
    >
      <UCard variant="subtle">
        <pre class="text-sm font-mono leading-7 text-toned whitespace-pre-wrap">{{ domainLog }}</pre>
      </UCard>
    </UPageSection>

    <ForYou />

    <UPageSection id="pricing" headline="Pricing" title="Start free. Scale when it matters." description="Plans shown are a layout draft — Pro and Team prices are not final.">
      <UPricingPlans :plans="plans" />
    </UPageSection>

    <UPageSection :ui="{ container: 'pb-24 sm:pb-32' }">
      <UPageCTA
        title="Ready to deploy?"
        description="Connect a repository and get a live URL in minutes."
        variant="subtle"
        />
    </UPageSection>
  </div>
</template>
