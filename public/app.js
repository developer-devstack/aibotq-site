/* Aibotq.dev shared runtime: nav/footer, auth state, API client, DOM helpers.
   All dynamic text goes through textContent (h()), never innerHTML. */
(function () {
  'use strict';
  const root = document.documentElement;
  const REPO_URL = 'https://github.com/thanabartbb/aibotq-site';
  const LABEL = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

  // ---------- DOM helper (safe by construction) ----------
  // h('div', {class:'x', onclick:fn, 'data-a':1}, 'text', childNode, [..])
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    (function add(list) {
      for (const c of list) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else n.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(kids);
    return n;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function safeUrl(u) {
    try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.toString() : null; } catch { return null; }
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - (typeof ts === 'number' ? ts : Date.parse(ts))) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago';
    return new Date(typeof ts === 'number' ? ts : Date.parse(ts)).toLocaleDateString();
  }

  // ---------- toasts ----------
  let toastBox;
  function toast(msg, kind, ms) {
    toastBox = toastBox || document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
    const t = h('div', { class: 'alert ' + (kind || '') }, h('span', { text: msg }));
    toastBox.append(t);
    setTimeout(() => t.remove(), ms || (kind === 'err' ? 8000 : 4500));
  }

  // ---------- API client ----------
  class ApiErr extends Error {
    constructor(message, status, code, extra) { super(message); this.status = status; this.code = code; this.extra = extra || {}; }
  }
  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
    let res, json;
    try { res = await fetch('/api' + path, init); } catch { throw new ApiErr('Cannot reach the Aibotq API — check your connection and try again.', 0, 'network'); }
    try { json = await res.json(); } catch { throw new ApiErr(`The API returned an unexpected response (HTTP ${res.status}). Is the Worker running?`, res.status, 'bad_response'); }
    if (!json || json.ok !== true) throw new ApiErr((json && json.error) || `Request failed (HTTP ${res.status})`, res.status, json && json.code, json);
    return json.data;
  }
  const memo = {};
  const once = (k, fn) => memo[k] || (memo[k] = fn().catch((e) => { delete memo[k]; throw e; }));
  const cfg = () => once('cfg', () => api('/config'));
  const me = (fresh) => { if (fresh) delete memo.me; return once('me', () => api('/me').then((d) => d.user)); };

  // ---------- login ----------
  const NEXT = { new: '/new/?step=1', dashboard: '/dashboard/' };
  async function login(provider, mode, next) {
    provider = provider || 'github';
    let c;
    try { c = await cfg(); } catch (e) { toast(e.message, 'err'); return false; }
    if (!c.providers[provider] || !c.providers[provider].configured) {
      toast(provider === 'github'
        ? 'GitHub sign-in is not set up on this server yet: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are missing (see the README).'
        : `${LABEL[provider] || provider} is not configured yet.`, 'err');
      return false;
    }
    location.href = `/api/auth/${provider}?mode=${mode === 'signup' ? 'signup' : 'login'}&next=${encodeURIComponent(next || NEXT.dashboard)}`;
    return true;
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch (e) { toast(e.message, 'err'); return; }
    location.href = '/';
  }

  // ---------- nav / footer ----------
  const GH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.8 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>';
  function svgNode(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstChild; }

  function avatarNode(user) {
    const a = h('span', { class: 'avatar', 'aria-hidden': 'true' }, (user.login || '?').slice(0, 1).toUpperCase());
    const src = safeUrl(user.avatar);
    if (src) {
      const img = h('img', { src, alt: '', width: 28, height: 28, referrerpolicy: 'no-referrer', style: 'width:100%;height:100%;border-radius:50%;object-fit:cover' });
      img.addEventListener('load', () => { clear(a); a.append(img); });
    }
    return a;
  }

  function buildNav(page) {
    const link = (href, text, key) => h('a', { href, class: page === key ? 'on' : '' }, text);
    const authSlot = h('div', { class: 'right', id: 'auth-slot' });
    const themeBtn = h('button', { class: 'icon', id: 'theme', 'aria-label': 'Toggle theme', type: 'button' });
    const searchBtn = h('button', { class: 'search', type: 'button', 'aria-label': 'Search pages' }, 'Search… ', h('kbd', { text: '⌘K' }));
    const right = h('div', { class: 'right' }, searchBtn, h('a', { class: 'icon gh-i', href: REPO_URL, 'aria-label': 'Aibotq.dev on GitHub', rel: 'noopener' }, svgNode(GH_ICON)), themeBtn, authSlot);
    const nav = h('nav', { class: 'top' }, h('div', { class: 'wrap' },
      h('a', { href: '/', class: 'logo d', 'aria-label': 'aibotq.dev home' }, h('span', { class: 'bolt', text: '⚡' }), h('span', {}, 'aibotq', h('span', { class: 'dev', text: '.dev' }))),
      h('div', { class: 'links' }, link('/docs/', 'Docs', 'docs'), link('/#templates', 'Templates', 'tpl'), link('/#how', 'How it works', 'how'), link('/dashboard/', 'Dashboard', 'dashboard'), link('/help/', 'Help', 'help')),
      right));
    searchBtn.addEventListener('click', openPalette);
    const sync = () => { themeBtn.textContent = root.dataset.theme === 'dark' ? '☀' : '☾'; };
    sync();
    themeBtn.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.theme = root.dataset.theme; } catch (e) { /* storage blocked */ }
      sync();
    });
    return { nav, authSlot };
  }

  function renderAuth(slot, user) {
    clear(slot);
    if (!user) {
      const lg = (mode, next) => (e) => { e.preventDefault(); login('github', mode, next); };
      slot.append(
        h('a', { class: 'btn g sm', id: 'login', href: '/api/auth/github?mode=login&next=%2Fdashboard%2F', onclick: lg('login', NEXT.dashboard) }, 'Log in'),
        h('a', { class: 'btn p sm', id: 'signup', href: '/api/auth/github?mode=signup&next=%2Fnew%2F%3Fstep%3D1', onclick: lg('signup', NEXT.new) }, 'Sign up'));
      return;
    }
    const menu = h('div', { class: 'menu hide', role: 'menu' },
      h('div', { class: 'who' }, h('b', { text: user.name || user.login }), '@' + user.login),
      h('a', { href: '/dashboard/', role: 'menuitem' }, 'Dashboard'),
      h('a', { href: '/new/', role: 'menuitem' }, 'New project'),
      h('a', { href: '/help/', role: 'menuitem' }, 'Help'),
      h('hr'),
      h('button', { type: 'button', role: 'menuitem', id: 'logout', onclick: logout }, 'Log out'));
    const btn = h('button', { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', id: 'me-btn' }, avatarNode(user), h('span', { text: user.login }));
    const wrap = h('div', { class: 'me' }, btn, menu);
    btn.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.classList.toggle('hide') === false; btn.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { menu.classList.add('hide'); btn.setAttribute('aria-expanded', 'false'); } });
    slot.append(h('a', { class: 'btn p sm', href: '/new/' }, 'New project'), wrap);
  }

  function buildFooter() {
    const col = (title, items) => h('div', {}, h('h4', { text: title }), items.map(([t, href]) => h('a', { href, text: t, rel: href.startsWith('http') ? 'noopener' : false })));
    const dot = h('i', { class: 'ld wait' });
    const label = h('span', { text: 'Checking API…' });
    const status = h('span', { class: 'status', id: 'api-status' }, dot, label);
    cfg().then((c) => {
      const missing = [];
      if (!c.providers.github.configured) missing.push('GitHub login');
      if (!c.deploy) missing.push('deploy pipeline');
      dot.className = 'ld';
      label.textContent = 'API online' + (missing.length ? ' · not configured: ' + missing.join(', ') : '');
    }).catch(() => { dot.className = 'ld bad'; label.textContent = 'API unreachable'; });
    return h('footer', {}, h('div', { class: 'wrap' },
      h('div', { class: 'fcols' },
        h('div', {}, h('a', { href: '/', class: 'logo d' }, h('span', { class: 'bolt', text: '⚡' }), h('span', {}, 'aibotq', h('span', { class: 'dev', text: '.dev' }))), h('p', { text: 'Import a repo or start from a template, then ship it to the edge on every push.' })),
        col('Product', [['New project', '/new/'], ['Dashboard', '/dashboard/'], ['Templates', '/#templates'], ['How it works', '/#how']]),
        col('Resources', [['Docs', '/docs/'], ['Help & FAQ', '/help/'], ['llms.txt', '/llms.txt'], ['Source on GitHub', REPO_URL]]),
        col('Legal', [['Privacy', '/privacy/'], ['Terms', '/terms/']])),
      h('div', { class: 'fb' }, h('span', { class: 'sp', text: '© ' + new Date().getFullYear() + ' Aibotq.dev' }), status)));
  }

  // ---------- command palette ----------
  const PAGES = [
    ['New project', '/new/', 'deploy'], ['Dashboard', '/dashboard/', 'projects'], ['Docs', '/docs/', 'guide'],
    ['Docs · Connect a source', '/docs/#source', ''], ['Docs · Configure', '/docs/#configure', ''], ['Docs · Deploy', '/docs/#deploy', ''],
    ['Docs · Git push = deploy', '/docs/#git-push', ''], ['Docs · Environment variables', '/docs/#env', ''], ['Docs · Build pipeline API', '/docs/#pipeline', ''],
    ['Templates', '/#templates', ''], ['How it works', '/#how', ''], ['Help & FAQ', '/help/', 'support'], ['Privacy', '/privacy/', 'legal'], ['Terms', '/terms/', 'legal'], ['Home', '/', ''],
  ];
  function openPalette() {
    if ($('.pal')) return;
    const input = h('input', { placeholder: 'Jump to a page…', 'aria-label': 'Search pages', autocomplete: 'off' });
    const list = h('ul');
    let sel = 0, shown = [];
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      shown = PAGES.filter(([t, , k]) => !q || (t + ' ' + k).toLowerCase().includes(q));
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      clear(list);
      if (!shown.length) list.append(h('li', { class: 'none', text: 'No matching pages.' }));
      shown.forEach(([t, href], i) => list.append(h('li', {}, h('a', { href, class: i === sel ? 'sel' : '' }, t, h('small', { text: href })))));
    };
    const close = () => { pal.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); draw(); }
      else if (e.key === 'Enter' && shown[sel]) { location.href = shown[sel][1]; }
    };
    const pal = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search pages', onclick: (e) => { if (e.target === pal) close(); } }, h('div', {}, input, list));
    input.addEventListener('input', () => { sel = 0; draw(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(pal); draw(); input.focus();
  }
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });

  // ---------- global delegates ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.copy');
    if (!b) return;
    const done = (t) => { b.textContent = t; setTimeout(() => (b.textContent = '⧉ Copy'), 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy || '') : Promise.reject()).then(() => done('✔ Copied'), () => done('✖ Copy failed'));
  });
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', e.clientX - r.left + 'px');
    c.style.setProperty('--my', e.clientY - r.top + 'px');
  });

  // ---------- boot ----------
  function boot() {
    const page = document.body.dataset.page || '';
    const navHost = $('#site-nav'), footHost = $('#site-footer');
    if (navHost) {
      const { nav, authSlot } = buildNav(page);
      navHost.replaceWith(nav);
      me().then((u) => renderAuth(authSlot, u)).catch(() => renderAuth(authSlot, null));
    }
    if (footHost) footHost.replaceWith(buildFooter());
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 }) : null;
    $$('.reveal').forEach((n) => (io ? io.observe(n) : n.classList.add('in')));
    const s = $('#stream');
    if (s) { // decorative typewriter in the sample terminal
      const w = "Hello! I'll check the weather for you…".split(/(?<= )/); let i = 0;
      setInterval(() => { if (i >= w.length) { i = 0; s.textContent = ''; } s.textContent += w[i++]; }, 220);
    }
    document.dispatchEvent(new CustomEvent('aq:ready'));
  }

  window.AQ = { h, $, $$, clear, safeUrl, timeAgo, toast, api, ApiErr, cfg, me, login, logout, LABEL, avatarNode };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
