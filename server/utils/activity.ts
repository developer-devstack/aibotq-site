// First-party activity tracking. Privacy rules: only after consent (aq_consent=1 cookie), honours Sec-GPC/DNT,
// stores a random anonymous id, a clean path (no query/hash), an allow-listed CTA id or a topic *category*. Never raw text.
import type { H3Event } from 'h3'
export const TOPICS: Record<string, RegExp> = {
  deploy: /\b(deploy|build|ship|release|vercel|cloudflare|worker|edge|preview)\b|ดีพลอย|ขึ้นเว็บ/i,
  git: /\b(git|github|gitlab|bitbucket|repo|push|commit|branch|pull request|pr)\b|พุช/i,
  env: /\b(env|environment|variable|secret|api key|config)\b|ตัวแปร/i,
  domains: /\b(domain|dns|ssl|https|cname)\b|โดเมน/i,
  templates: /\b(template|starter|boilerplate|scaffold)\b|เทมเพลต/i,
  agents: /\b(agent|tool call|mcp|llm|model|prompt|chatbot|ai)\b|เอเจนต์|บอท/i,
  data: /\b(extract|clairic|pdf|image|ocr|invoice|receipt|parse)\b|ดึงข้อมูล/i,
  errors: /\b(error|fail|failed|bug|crash|broken|not working|500|404)\b|พัง|ไม่ได้|ผิดพลาด/i,
  pricing: /\b(price|pricing|cost|free|plan|billing)\b|ราคา|ฟรี/i,
}
export function classify(text: string): string[] {
  const t = String(text || '').slice(0, 4000)
  const out = Object.keys(TOPICS).filter(k => TOPICS[k]!.test(t))
  return out.length ? out.slice(0, 3) : ['other']
}
export const CTAS = new Set(['hero_start', 'hero_docs', 'nav_new', 'nav_docs', 'nav_chat', 'nav_dashboard', 'tpl_agent-app', 'tpl_ai-chatbot', 'tpl_commerce-agent', 'suggest', 'login', 'import_repo', 'deploy'])
export function cleanPath(p: any) {
  let s = String(p || '/').split(/[?#]/)[0]!.slice(0, 120)
  if (!s.startsWith('/')) s = '/' + s
  return s.replace(/[^\w\-/.]/g, '').replace(/\/[0-9a-f-]{16,}/gi, '/:id')
}
export function visitor(event: H3Event): string | null {
  if (getCookie(event, 'aq_consent') !== '1') return null
  if (getHeader(event, 'sec-gpc') === '1' || getHeader(event, 'dnt') === '1') return null
  const v = getCookie(event, 'aq_vid') || ''
  return /^[a-z0-9]{16,40}$/i.test(v) ? v : null
}
export async function record(env: any, event: H3Event, e: { type: 'pageview' | 'click' | 'topic', path?: string | null, target?: string | null, topic?: string | null }) {
  const vid = visitor(event); if (!vid || !env?.DB) return false
  const country = String((event.context as any).cloudflare?.request?.cf?.country || getHeader(event, 'cf-ipcountry') || '').slice(0, 2) || null
  const now = Date.now()
  await env.DB.prepare('INSERT INTO activity_events (ts, vid, type, path, target, topic, country) VALUES (?,?,?,?,?,?,?)')
    .bind(now, vid, e.type, e.path ?? null, e.target ?? null, e.topic ?? null, country).run()
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM activity_events WHERE ts < ?').bind(now - 30 * 864e5).run().catch(() => {})
  return true
}
// Catalogue of real things on the site to suggest, keyed by interest.
export const CATALOG: Record<string, { title: string, to: string, kind: 'doc' | 'template' | 'prompt' }[]> = {
  deploy: [{ title: 'Deploy in 3 steps', to: '/docs/#deploy', kind: 'doc' }, { title: 'Build pipeline contract', to: '/docs/#pipeline', kind: 'doc' }, { title: 'Why did my build fail?', to: '/chat/?q=' + encodeURIComponent('Why did my build fail and how do I fix it?'), kind: 'prompt' }],
  git: [{ title: 'Git push = deploy', to: '/docs/#git-push', kind: 'doc' }, { title: 'Connect a source', to: '/docs/#source', kind: 'doc' }, { title: 'Import a GitHub repo', to: '/new/', kind: 'template' }],
  env: [{ title: 'Environment variables', to: '/docs/#env', kind: 'doc' }, { title: 'How do I add secrets safely?', to: '/chat/?q=' + encodeURIComponent('How do I add environment variables and secrets safely?'), kind: 'prompt' }],
  domains: [{ title: 'Configure your project', to: '/docs/#configure', kind: 'doc' }, { title: 'Set up a custom domain', to: '/chat/?q=' + encodeURIComponent('How do I connect a custom domain?'), kind: 'prompt' }],
  templates: [{ title: 'Agent App template', to: '/new/?template=agent-app', kind: 'template' }, { title: 'AI Chatbot template', to: '/new/?template=ai-chatbot', kind: 'template' }, { title: 'Commerce Agent template', to: '/new/?template=commerce-agent', kind: 'template' }],
  agents: [{ title: 'Agent App template', to: '/new/?template=agent-app', kind: 'template' }, { title: 'Build an agent with tools', to: '/chat/?q=' + encodeURIComponent('Help me build an AI agent with tools and deploy it'), kind: 'prompt' }, { title: 'JSON API', to: '/docs/#api', kind: 'doc' }],
  data: [{ title: 'Extract data from a receipt', to: '/chat/?q=' + encodeURIComponent('Extract the total, date and merchant from this receipt'), kind: 'prompt' }, { title: 'What changed: Clairic', to: '/changelog/', kind: 'doc' }],
  errors: [{ title: 'Get help', to: '/help/', kind: 'doc' }, { title: 'Debug my deployment', to: '/chat/?q=' + encodeURIComponent('My deployment is failing, help me debug it'), kind: 'prompt' }],
  pricing: [{ title: 'Help & FAQ', to: '/help/', kind: 'doc' }],
  self: [{ title: 'Self-hosting', to: '/docs/#self-host', kind: 'doc' }],
  start: [{ title: 'Start a new project', to: '/new/', kind: 'template' }, { title: 'Read the docs', to: '/docs/', kind: 'doc' }, { title: 'Ask the agent', to: '/chat/', kind: 'prompt' }],
}
export function pathInterest(path: string, target?: string | null): string | null {
  if (target?.startsWith('tpl_')) return 'templates'
  if (/^\/new/.test(path)) return 'templates'
  if (/^\/docs/.test(path)) return 'deploy'
  if (/^\/dashboard/.test(path)) return 'deploy'
  if (/^\/help/.test(path)) return 'errors'
  if (/^\/chat/.test(path)) return 'agents'
  return null
}
