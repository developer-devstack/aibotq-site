<script setup lang="ts">
defineProps<{ html: string }>()
</script>
<template>
  <!-- Tailwind utility variants style the trusted, repo-owned legacy markup. -->
  <div
    class="text-toned leading-7 space-y-5
      [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-highlighted [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:border-b [&_h2]:border-default [&_h2]:pb-2
      [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-highlighted [&_h3]:mt-8 [&_h3]:scroll-mt-24
      [&_a]:text-primary [&_a]:font-medium hover:[&_a]:underline
      [&_strong]:text-highlighted [&_b]:text-highlighted
      [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:ps-6 [&_ol]:space-y-2
      [&_code]:font-mono [&_code]:text-sm [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-elevated [&_code]:ring [&_code]:ring-default
      [&_pre]:bg-elevated/60 [&_pre]:ring [&_pre]:ring-default [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-sm
      [&_pre_code]:bg-transparent [&_pre_code]:ring-0 [&_pre_code]:p-0
      [&_.win]:rounded-lg [&_.win]:overflow-hidden [&_.bar]:text-xs [&_.bar]:text-muted [&_.bar]:font-mono [&_.bar]:pb-2
      [&_table]:w-full [&_table]:text-sm [&_th]:text-start [&_th]:text-highlighted [&_th]:py-2 [&_th]:border-b [&_th]:border-default [&_td]:py-2 [&_td]:pe-4 [&_td]:border-b [&_td]:border-default [&_td]:align-top
      [&_.cards3]:grid [&_.cards3]:gap-4 sm:[&_.cards3]:grid-cols-3 [&_.card]:rounded-lg [&_.card]:p-5 [&_.card]:ring [&_.card]:ring-default [&_.card]:bg-elevated/40 [&_.ic]:text-primary [&_.ic]:text-xl
      [&_details]:rounded-lg [&_details]:ring [&_details]:ring-default [&_details]:px-4 [&_details]:py-3 [&_details]:mb-3 [&_summary]:font-semibold [&_summary]:text-highlighted [&_summary]:cursor-pointer"
    v-html="html"
  />
</template>
