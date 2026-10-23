/* /dashboard — projects and deployments from the real API. */
(function () {
  'use strict';
  const { h, $, $$, clear, safeUrl, timeAgo, toast, api, me, cfg, login, LABEL } = AQ;
  const root = $('#root');
  const FW = { nextjs: 'Next.js', nuxt: 'Nuxt', astro: 'Astro', sveltekit: 'SvelteKit', remix: 'Remix', vite: 'Vite', cra: 'Create React App', node: 'Node.js', static: 'Static site', other: 'Other' };
  const S = { projects: [], sel: null, deps: [], depSel: null, timer: null, user: null };

  const pill = (s) => h('span', { class: 'pill ' + (s || 'created'), text: s === 'ready' ? 'live' : s || 'created' });
  const stopTimer = () => { clearTimeout(S.timer); S.timer = null; };

  function gate(title, msg, extra) {
    clear(root).append(h('div', { class: 'gate' }, h('h1', { class: 'd', text: title }), h('p', { text: msg }), extra));
  }

  async function start() {
    let user;
    try { user = await me(); } catch (e) { return gate('API unreachable', e.message, h('button', { class: 'btn p', onclick: () => location.reload() }, 'Retry')); }
    if (!user) {
      return gate('Sign in to see your projects', 'Your dashboard lists every project and deployment tied to your account.',
        h('button', { class: 'btn p lg', type: 'button', onclick: () => login('github', 'login', '/dashboard/') }, 'Continue with GitHub'));
    }
    S.user = user;
    await load();
  }

  async function load(keepSel) {
    try {
      S.projects = (await api('/projects')).projects;
    } catch (e) {
      if (e.status === 401) return start();
      return gate('Could not load projects', e.message, h('button', { class: 'btn p', onclick: () => load() }, 'Retry'));
    }
    if (!keepSel) S.sel = (new URLSearchParams(location.search).get('p') && S.projects.find((p) => p.id === new URLSearchParams(location.search).get('p'))) ? new URLSearchParams(location.search).get('p') : S.projects[0] && S.projects[0].id;
    render();
    if (S.sel) loadDeps();
  }

  function render() {
    const live = S.projects.filter((p) => p.status === 'live').length;
    const building = S.projects.filter((p) => p.latest_deployment && ['queued', 'building'].includes(p.latest_deployment.status)).length;
    clear(root).append(
      h('div', { class: 'dh' }, h('div', {}, h('span', { class: 'kick', style: 'font:500 12px "JetBrains Mono";color:var(--cyan);letter-spacing:.12em;text-transform:uppercase', text: '// dashboard' }),
        h('h1', { class: 'd' }, 'Your ', h('span', { class: 'grad', text: 'projects' })), h('p', { text: `Signed in as @${S.user.login}` })),
        h('a', { class: 'btn p', href: '/new/' }, '+ New project')),
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', { text: String(S.projects.length) }), h('span', { text: 'Projects' })),
        h('div', { class: 'kpi' }, h('b', { style: 'color:var(--lime)', text: String(live) }), h('span', { text: 'Live' })),
        h('div', { class: 'kpi' }, h('b', { style: 'color:var(--cyan)', text: String(building) }), h('span', { text: 'Deploying now' }))),
      S.projects.length ? h('div', { class: 'dgrid' }, h('div', { class: 'plist', id: 'plist' }), h('div', { class: 'detail', id: 'detail' }))
        : h('div', { class: 'empty', style: 'padding:56px 20px' }, h('p', { style: 'font-size:18px;color:var(--t1);margin-bottom:8px', text: 'No projects yet.' }), h('p', { text: 'Import a repository, upload a folder or start from a template.' }), h('a', { class: 'btn p', style: 'margin-top:18px', href: '/new/' }, 'Create your first project')));
    if (S.projects.length) { renderList(); renderDetail(); }
  }

  function renderList() {
    const l = clear($('#plist'));
    S.projects.forEach((p) => {
      const ld = p.latest_deployment;
      l.append(h('button', { type: 'button', class: 'pj' + (p.id === S.sel ? ' on' : ''), onclick: () => { S.sel = p.id; S.depSel = null; stopTimer(); renderList(); renderDetail(); loadDeps(); history.replaceState(null, '', '?p=' + encodeURIComponent(p.id)); } },
        h('div', { class: 't' }, h('b', { text: p.name }), pill(ld ? ld.status : p.status)),
        h('small', { text: p.repo_full_name || 'Uploaded files' }),
        h('small', { text: [FW[p.framework] || p.framework, ld ? `${ld.environment} · ${timeAgo(ld.created_at)}` : `created ${timeAgo(p.created_at)}`].filter(Boolean).join(' · ') })));
    });
  }

  const cur = () => S.projects.find((p) => p.id === S.sel);

  function renderDetail() {
    const p = cur(), d = clear($('#detail'));
    if (!p) return;
    const u = safeUrl(p.url);
    const ws = p.webhook_status || '';
    const redeployBtn = h('button', { class: 'btn p sm', type: 'button', onclick: redeploy }, 'Redeploy ⚡');
    d.append(
      h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:start' },
        h('h2', { class: 'd', text: p.name }), h('div', { class: 'acts' }, u && h('a', { class: 'btn g sm', href: u, target: '_blank', rel: 'noopener' }, 'Visit ↗'), redeployBtn)),
      h('div', { class: 'meta' },
        pill(p.status),
        p.repo_full_name ? h('span', { class: 'tag mut', text: `${LABEL[p.provider]} · ${p.repo_full_name}` }) : h('span', { class: 'tag mut', text: 'Upload' }),
        p.private && h('span', { class: 'tag org', text: 'Private' }),
        h('span', { class: 'tag mut', text: FW[p.framework] || p.framework || 'Other' }),
        h('span', { class: 'tag ' + (ws === 'active' ? '' : 'mut'), title: ws, text: ws === 'active' ? 'Git push = deploy: active' : 'Auto-deploy: ' + (ws.replace(/^\w+:\s*/, '') || 'off').slice(0, 60) })),
      u && h('div', { class: 'live', style: 'margin:0 0 6px;padding:14px 18px' }, h('div', {}, h('b', { text: '● Production' }), h('a', { class: 'u', style: 'font-size:16px', href: u, target: '_blank', rel: 'noopener', text: u }))),
      h('div', { id: 'dep-alert' }),
      h('div', { class: 'dh3', text: 'Deployments' }),
      h('div', { id: 'deplist' }, h('div', { class: 'skel' })),
      h('div', { id: 'deplog' }));
  }

  async function loadDeps() {
    const id = S.sel;
    try {
      const d = await api(`/projects/${encodeURIComponent(id)}/deployments`);
      if (id !== S.sel) return;
      S.deps = d.deployments;
      if (!S.depSel || !S.deps.find((x) => x.id === S.depSel)) S.depSel = S.deps[0] && S.deps[0].id;
      // keep the project row in sync with the freshest deployment
      const p = cur(), top = S.deps[0];
      if (p && top) { p.latest_deployment = { id: top.id, status: top.status, step: top.step, url: top.url, environment: top.environment, created_at: top.created_at }; if (top.status === 'ready' && top.environment === 'production') { p.status = 'live'; p.url = top.url; } renderList(); }
      renderDeps();
      if (S.deps.some((x) => x.status === 'queued' || x.status === 'building')) { stopTimer(); S.timer = setTimeout(loadDeps, 2500); }
    } catch (e) {
      if (id !== S.sel) return;
      const box = $('#deplist'); if (box) clear(box).append(h('div', { class: 'alert err' }, h('span', { text: e.message })));
    }
  }

  function renderDeps() {
    const box = $('#deplist'); if (!box) return;
    clear(box);
    if (!S.deps.length) box.append(h('div', { class: 'empty', text: 'No deployments yet. Hit “Redeploy” to ship this project.' }));
    S.deps.forEach((x) => box.append(h('button', { type: 'button', class: 'dep' + (x.id === S.depSel ? ' on' : ''), onclick: () => { S.depSel = x.id; renderDeps(); } },
      pill(x.status),
      h('div', { class: 'dm' }, h('b', { text: `${x.environment}${x.ref ? ' · ' + x.ref : ''}` }), h('small', { text: `${x.step}${x.commit_sha ? ' · ' + x.commit_sha.slice(0, 7) : ''} · ${timeAgo(x.created_at)}` })))));
    const sel = S.deps.find((x) => x.id === S.depSel), lg = clear($('#deplog'));
    if (!sel) return;
    const u = safeUrl(sel.url);
    lg.append(h('div', { class: 'dh3', text: 'Log' }),
      h('div', { class: 'win' }, h('div', { class: 'bar' }, h('b', { style: 'background:#FF5F57' }), h('b', { style: 'background:#FEBC2E' }), h('b', { style: 'background:#28C840' }), h('span', { text: `${sel.id.slice(0, 8)} — ${sel.status}` }), h('button', { class: 'copy', 'data-copy': sel.log || '' }, '⧉ Copy')),
        h('pre', { class: 'log', text: sel.log || '(empty)' })),
      u && h('p', { class: 'hint' }, 'Deployed to ', h('a', { href: u, target: '_blank', rel: 'noopener', style: 'color:var(--cyan)', text: u })));
  }

  async function redeploy(e) {
    const btn = e.currentTarget, p = cur(); if (!p) return;
    btn.disabled = true; btn.classList.add('busy');
    const box = clear($('#dep-alert'));
    try {
      const d = await api(`/projects/${encodeURIComponent(p.id)}/deploy`, { method: 'POST', body: {} });
      S.depSel = d.deployment.id; toast('Deployment queued.', 'ok');
    } catch (ex) {
      box.append(h('div', { class: 'alert err' }, h('span', { text: ex.message })));
      if (ex.code === 'in_progress') toast('A deployment is already running.', '');
    } finally { btn.disabled = false; btn.classList.remove('busy'); }
    stopTimer(); loadDeps();
  }

  window.addEventListener('pagehide', stopTimer);
  start();
})();
