// Runs the vanilla page scripts (nav/footer, auth state, wizard) after Vue has hydrated,
// so hydration never overwrites the DOM they build. Loaded in order, once per page view.
export function useLegacyScripts(srcs: string[]) {
  onMounted(async () => {
    for (const src of srcs) {
      await new Promise<void>((resolve) => {
        const s = document.createElement('script')
        s.src = src
        s.onload = s.onerror = () => resolve()
        document.body.appendChild(s)
      })
    }
  })
}
