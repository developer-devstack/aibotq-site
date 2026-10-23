// Splits the legacy static page markup into header (eyebrow/title/lead) and body for Nuxt UI page layouts.
export function splitLegacy(html: string) {
  const ph = /<div class="ph">([\s\S]*?)<\/div>/.exec(html)?.[1] || ''
  const strip = (s = '') => s.replace(/<[^>]+>/g, '').trim()
  const title = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(ph)?.[1])
  const lead = strip(/<p[^>]*>([\s\S]*?)<\/p>/.exec(ph)?.[1])
  const updated = strip(/<p class="upd"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1])
  let body = html.slice(html.indexOf('</div>', html.indexOf('class="ph"')) + 6)
  body = body.replace(/<nav class="toc"[\s\S]*?<\/nav>/, '').replace(/<\/div>\s*<\/main>[\s\S]*$/, '').replace(/<p class="upd"[\s\S]*?<\/p>/, '')
  body = body.replace(/<button class="copy"[^>]*>[\s\S]*?<\/button>/g, '').replace(/ class="d"/g, '')
  const toc = [...html.matchAll(/<nav class="toc"[\s\S]*?<\/nav>/g)].flatMap(m => [...m[0].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(a => ({ label: a[2], to: a[1] })))
  return { title, lead, updated, body, toc }
}
