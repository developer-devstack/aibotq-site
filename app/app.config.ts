export default defineAppConfig({
  ui: {
    colors: { primary: 'orange', neutral: 'zinc' },
    // Orange is a single accent: feature icons stay neutral.
    pageCard: { slots: { leadingIcon: 'text-highlighted' } },
    pageFeature: { slots: { leadingIcon: 'text-highlighted' } },
    pageSection: { slots: { headline: 'text-muted' } },
    pageHeader: { slots: { headline: 'text-muted' } },
  },
})
