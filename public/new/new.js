/* /new — connect source → configure → deploy. Talks only to the real /api; every failure is shown, nothing is simulated. */
(function () {
  'use strict';
  const { h, $, $$, clear, safeUrl, timeAgo, toast, api, cfg, me, login, LABEL } = AQ;
  const NEXT_NEW = '/new/?step=1';
  const FW = { nextjs: 'Next.js', nuxt: 'Nuxt', astro: 'Astro', sveltekit: 'SvelteKit', remix: 'Remix', vite: 'Vite', cra: 'Create React App', node: 'Node.js', static: 'Static site', other: 'Other' };
  const IGNORE = new Set(['node_modules', '.git', '.next', '.wrangler', '.DS_Store']);
  const MAX_BYTES = 50 * 1024 * 1024, MAX_FILES = 1000;
  const S = { user: null, cfg: null, provider: 'github', source: null, project: null, dep: null, step: 1, page: 1, q: '', reqId: 0, templates: {}, dirty: new Set(), poll: null, detectId: 0, envRows: [] };

  const alertBox = (host, msg, kind, extra) => { const a = h('div', { class: 'alert ' + (kind || '') }, h('span', { text: msg }), extra); clear(host).append(a); return a; };
  const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); };
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40);
  const fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  // ---------- step chrome ----------
  const TITLES = [
    ['Launch your next ', 'agent.', 'Connect a Git repository or start from a tuned template. Every push ships to the edge with a preview URL — zero config, full throttle.'],
    ['Tune your ', 'setup.', 'Check the detected settings, add environment variables, and create the project.'],
    ['Deploy to the ', 'edge.', 'Send it down the pit lane. Status and logs below are the real thing, straight from the build pipeline.'],
  ];
  function go(n) {
    S.step = n;
    ['s1', 's2', 's3'].forEach((id, i) => $('#' + id).classList.toggle('hide', i + 1 !== n));
    $('#guide').classList.toggle('hide', n !== 1);
    const [a, b, c] = TITLES[n - 1];
    clear($('#h1')).append(a, h('em', { text: b }));
    $('#lead').textContent = c;
    $$('#steps .st').forEach((el, i) => {
      el.classList.toggle('on', i + 1 === n);
      el.classList.toggle('done', i + 1 < n);
      el.disabled = !(i + 1 < n && !S.project);
      el.onclick = () => { if (!el.disabled) go(i + 1); };
    });
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('step', String(n));
    if (S.project && n === 3) u.searchParams.set('project', S.project.id);
    history.replaceState(null, '', u);
    if (n !== 3) stopPoll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function needAuth(what) {
    const msg = `Sign in to ${what}.`;
    const btn = h('button', { class: 'btn p sm', type: 'button', style: 'margin-left:auto', onclick: () => login('github', 'login', NEXT_NEW) }, 'Continue with GitHub');
    alertBox($('#alerts'), msg, 'warn', btn);
    $('#alerts').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ---------- auth state / repo list ----------
  function renderAuthState() {
    const u = S.user;
    $('#imp-anon').classList.toggle('hide', !!u);
    $('#imp-auth').classList.toggle('hide', !u);
    $('#imp-ds').textContent = u ? 'Choose a repository from your account.' : 'Pick a provider to list your repositories.';
    if (!u) return;
    clear($('#acct')).append(AQ.avatarNode(u), h('span', {}, 'Signed in as ', h('b', { text: '@' + u.login })), h('span', { class: 'sp' }), h('button', { type: 'button', onclick: AQ.logout }, 'Log out'));
    const tabs = clear($('#ptabs'));
    ['github', 'gitlab', 'bitbucket'].forEach((p) => tabs.append(h('button', { type: 'button', role: 'tab', class: p === S.provider ? 'on' : '', 'aria-selected': String(p === S.provider), onclick: () => { S.provider = p; S.q = ''; $('#rsearch').value = ''; renderAuthState(); loadRepos(true); } }, LABEL[p])));
  }

  async function loadRepos(reset) {
    const p = S.provider, list = $('#rlist'), more = $('#rmore'), hint = $('#rhint');
    const id = ++S.reqId;
    hint.textContent = ''; hint.className = 'hint';
    if (reset) { S.page = 1; clear(list); more.classList.add('hide'); for (let i = 0; i < 4; i++) list.append(h('div', { class: 'skel' })); }
    $('#rsearch').disabled = false;
    const connected = S.user && S.user.connected && S.user.connected[p];
    if (!connected) {
      clear(list);
      more.classList.add('hide');
      const conf = S.cfg && S.cfg.providers[p] && S.cfg.providers[p].configured;
      if (!conf) list.append(h('div', { class: 'empty' }, `${LABEL[p]} is not configured yet.`, h('br'), h('small', { text: 'The server operator needs to add OAuth credentials for it.' })));
      else list.append(h('div', { class: 'empty' }, `${LABEL[p]} isn't connected to your account.`, h('br'), h('button', { class: 'btn p sm', type: 'button', style: 'margin-top:12px', onclick: () => login(p, 'login', NEXT_NEW) }, `Connect ${LABEL[p]}`)));
      $('#rsearch').disabled = true;
      return;
    }
    try {
      const d = await api(`/repos?provider=${p}&q=${encodeURIComponent(S.q)}&page=${S.page}`);
      if (id !== S.reqId) return;
      if (reset) clear(list);
      else $$('.skel', list).forEach((n) => n.remove());
      if (!d.repos.length && S.page === 1) list.append(h('div', { class: 'empty', text: S.q ? `No repositories match "${S.q}".` : `No repositories found on ${LABEL[p]}.` }));
      d.repos.forEach((r) => list.append(h('div', { class: 'repo' },
        h('div', { class: 'rm' }, h('b', { text: r.full_name }), h('small', { text: [r.description, r.language, r.updated_at && timeAgo(r.updated_at)].filter(Boolean).join(' · ') || 'No description' })),
        r.private && h('span', { class: 'tag org', text: 'Private' }),
        h('button', { type: 'button', 'aria-label': 'Import ' + r.full_name, onclick: () => chooseSource('import', r) }, 'Import'))));
      more.classList.toggle('hide', !d.has_more);
      if (d.truncated) { hint.textContent = 'Search covered your 500 most recently pushed repositories only.'; }
    } catch (e) {
      if (id !== S.reqId) return;
      clear(list);
      list.append(h('div', { class: 'alert err' }, h('span', { text: e.message })));
      more.classList.add('hide');
    }
  }

  // ---------- public URL ----------
  async function onUrl(e) {
    e.preventDefault();
    const input = $('#repourl'), hint = $('#urlhint'), btn = $('#urlbtn');
    const v = input.value.trim();
    hint.className = 'hint';
    if (!v) { hint.className = 'hint err'; hint.textContent = 'Enter a repository URL, e.g. https://github.com/user/repo'; return; }
    if (!S.user) { hint.className = 'hint err'; hint.textContent = 'Sign in first — the repository check runs with your account.'; return needAuth('check and import a repository URL'); }
    busy(btn, true); hint.textContent = 'Checking repository…';
    try {
      const d = await api('/repos/resolve', { method: 'POST', body: { url: v } });
      hint.className = 'hint ok'; hint.textContent = `Found ${d.repo.full_name} on ${LABEL[d.repo.provider]}.`;
      chooseSource('url', d.repo);
    } catch (err) { hint.className = 'hint err'; hint.textContent = err.message; }
    finally { busy(btn, false); }
  }

  // ---------- upload ----------
  async function walkEntry(entry, prefix, out) {
    if (out.length > MAX_FILES + 50) return;
    if (!entry || IGNORE.has(entry.name) || entry.name.startsWith('.env')) return;
    if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)); out.push({ file, path: prefix + entry.name }); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const c of batch) await walkEntry(c, prefix + entry.name + '/', out);
    }
  }
  async function fromDrop(dt) {
    const entries = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entries.length) return [...dt.files].map((f) => ({ file: f, path: f.name }));
    const out = [];
    for (const en of entries) await walkEntry(en, '', out);
    const roots = new Set(out.map((o) => o.path.split('/')[0]));
    const oneDir = entries.length === 1 && entries[0].isDirectory && roots.size === 1;
    return oneDir ? out.map((o) => ({ file: o.file, path: o.path.split('/').slice(1).join('/') })) : out;
  }
  function fromPicker(files) {
    const list = [...files];
    const rel = list.map((f) => f.webkitRelativePath || f.name);
    const stripRoot = rel.every((p) => p.includes('/'));
    return list.map((f, i) => ({ file: f, path: stripRoot ? rel[i].split('/').slice(1).join('/') : rel[i] }))
      .filter((o) => o.path && !o.path.split('/').some((s) => IGNORE.has(s) || s.startsWith('.env')));
  }
  function uploadError(msg) {
    $('#droptxt').textContent = '⇪ Or drop a project folder or .zip here';
    $('#uprog').classList.add('hide');
    alertBox($('#alerts'), msg, 'err');
    $('#alerts').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function doUpload(items, rootName) {
    if (!S.cfg || !S.cfg.uploads) return uploadError('Upload is not enabled on this server: no R2 bucket is bound to UPLOADS. Import from Git instead, or see the README to enable uploads.');
    if (!S.user) return needAuth('upload a project');
    if (!items.length) return uploadError('No uploadable files found (node_modules, .git and .env files are skipped).');
    const total = items.reduce((n, o) => n + o.file.size, 0);
    if (items.length > MAX_FILES) return uploadError(`Too many files (${items.length}; limit ${MAX_FILES}). Exclude build output and dependencies, or upload a .zip.`);
    if (total > MAX_BYTES) return uploadError(`Upload is ${fmtBytes(total)} — the limit is ${fmtBytes(MAX_BYTES)}.`);
    $('#alerts').replaceChildren();
    const fd = new FormData();
    items.forEach((o) => fd.append('files', o.file, o.path));
    const prog = $('#uprog'), bar = $('i', prog);
    prog.classList.remove('hide'); bar.style.width = '0';
    $('#droptxt').textContent = `Uploading ${items.length} file${items.length > 1 ? 's' : ''} (${fmtBytes(total)})…`;
    let pkg = null;
    const pj = items.find((o) => o.path === 'package.json');
    if (pj) { try { pkg = JSON.parse(await pj.file.text()); } catch { pkg = null; } }
    try {
      const d = await new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('POST', '/api/upload'); x.responseType = 'json';
        x.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%'; };
        x.onerror = () => reject(new Error('Upload failed: network error.'));
        x.onload = () => { const j = x.response; if (j && j.ok) resolve(j.data); else reject(new Error((j && j.error) || `Upload failed (HTTP ${x.status}).`)); };
        x.send(fd);
      });
      prog.classList.add('hide');
      $('#droptxt').textContent = '⇪ Or drop a project folder or .zip here';
      toast(`Uploaded ${d.file_count} file${d.file_count === 1 ? '' : 's'}${d.skipped ? ` (${d.skipped} skipped)` : ''}.`, 'ok');
      chooseSource('upload', { name: rootName, upload_id: d.upload_id, file_count: d.file_count, bytes: d.bytes, skipped: d.skipped, pkg });
    } catch (e) { uploadError(e.message); }
  }

  // ---------- templates ----------
  async function loadTemplates() {
    try {
      const d = await api('/templates');
      d.templates.forEach((t) => (S.templates[t.id] = t.repo));
      $$('#tpl .tc2').forEach((el) => {
        if (!S.templates[el.dataset.template]) { el.classList.add('off'); el.title = 'This template is not configured on this server.'; }
      });
    } catch { /* cards stay enabled; creating will report the real error */ }
  }
  function openTemplateForm(id) {
    if (!S.user) return needAuth('create a repository from a template');
    const host = clear($('#tform-host'));
    $$('#tpl .tc2').forEach((el) => el.classList.toggle('on', el.dataset.template === id));
    if (!S.templates[id]) { host.append(h('div', { class: 'alert err' }, h('span', { text: `The "${id}" template is not configured on this server (missing from the TEMPLATES variable).` }))); return; }
    const title = ($(`#tpl [data-template="${CSS.escape(id)}"] b`) || {}).textContent || id;
    const name = h('input', { class: 'in', id: 't-name', value: id, maxlength: '100', spellcheck: 'false', autocomplete: 'off' });
    const priv = h('input', { type: 'checkbox', checked: true });
    const err = h('div');
    const go1 = h('button', { class: 'btn p sm', type: 'submit' }, 'Create repository →');
    const form = h('form', { class: 'tform', novalidate: true },
      h('h3', { class: 'd', text: `Create from ${title}` }),
      h('p', { class: 'hint', style: 'margin:-6px 0 12px' }, 'Copies ', h('b', { text: S.templates[id] }), ' into your GitHub account.'),
      h('label', { class: 'fl', for: 't-name' }, 'New repository name'), name,
      h('label', { class: 'chk', style: 'margin-top:12px' }, priv, 'Private repository'),
      err,
      h('div', { class: 'acts' }, go1, h('button', { class: 'btn g sm', type: 'button', onclick: () => { clear(host); $$('#tpl .tc2').forEach((el) => el.classList.remove('on')); } }, 'Cancel')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      busy(go1, true); clear(err);
      try {
        const d = await api(`/templates/${encodeURIComponent(id)}/create`, { method: 'POST', body: { name: name.value.trim(), private: priv.checked } });
        toast(`Created ${d.repo.full_name}.`, 'ok');
        clear(host);
        chooseSource('template', d.repo);
      } catch (ex) { alertBox(err, ex.message, 'err'); }
      finally { busy(go1, false); }
    });
    host.append(form);
    name.focus(); name.select();
  }
  function toggleAllTemplates() {
    const box = $('#alltpl'), btn = $('#browse');
    const open = box.classList.toggle('hide') === false;
    btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    clear(box);
    const entries = Object.entries(S.templates);
    if (!entries.length) { box.append(h('div', { class: 'empty', text: 'No templates are configured on this server (TEMPLATES variable is empty).' })); return; }
    entries.forEach(([id, repo]) => box.append(h('div', { class: 'repo' },
      h('div', { class: 'rm' }, h('b', { text: id }), h('small', {}, h('a', { href: 'https://github.com/' + repo, target: '_blank', rel: 'noopener', text: repo }))),
      h('button', { type: 'button', onclick: () => openTemplateForm(id) }, 'Use'))));
  }

  // ---------- step 1 → 2 ----------
  function chooseSource(kind, r) {
    $('#alerts').replaceChildren();
    S.dirty.clear();
    if (kind === 'upload') S.source = { kind, name: r.name || 'upload', upload_id: r.upload_id, file_count: r.file_count, bytes: r.bytes, pkg: r.pkg };
    else S.source = { kind, provider: r.provider, full_name: r.full_name, name: r.name, private: r.private, branch: r.default_branch, html_url: r.html_url };
    enterConfigure();
  }

  function pkgDetect(pkg) {
    if (!pkg) return { framework: 'static', build_command: '', output_dir: '.' };
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }, has = (n) => n in deps;
    const hb = !!(pkg.scripts && pkg.scripts.build), b = hb ? 'npm run build' : '';
    if (has('next')) return { framework: 'nextjs', build_command: b || 'npx next build', output_dir: '.next' };
    if (has('nuxt')) return { framework: 'nuxt', build_command: b || 'npx nuxt build', output_dir: '.output' };
    if (has('astro')) return { framework: 'astro', build_command: b || 'npx astro build', output_dir: 'dist' };
    if (has('@sveltejs/kit')) return { framework: 'sveltekit', build_command: b || 'npx vite build', output_dir: '.svelte-kit' };
    if (has('@remix-run/react') || has('@remix-run/node')) return { framework: 'remix', build_command: b || 'npx remix build', output_dir: 'build' };
    if (has('vite')) return { framework: 'vite', build_command: b || 'npx vite build', output_dir: 'dist' };
    if (has('react-scripts')) return { framework: 'cra', build_command: b || 'npx react-scripts build', output_dir: 'build' };
    return { framework: 'other', build_command: b, output_dir: hb ? 'dist' : '.' };
  }

  function applyDetected(d, note) {
    const set = (key, id, v) => { if (!S.dirty.has(key)) $(id).value = v; };
    set('fw', '#f-fw', d.framework); set('build', '#f-build', d.build_command); set('out', '#f-out', d.output_dir === '.' ? '' : d.output_dir);
    const host = clear($('#detected'));
    host.append(h('div', { class: 'detected' }, h('span', { style: 'color:var(--lime)', text: '✔' }), h('span', {}, note || `Detected `, h('b', { text: FW[d.framework] || d.framework }))));
  }

  async function detect() {
    const s = S.source, id = ++S.detectId, host = clear($('#detected'));
    if (s.kind === 'upload') {
      applyDetected(pkgDetect(s.pkg), s.pkg ? 'Detected from package.json: ' : 'No package.json in the upload — treated as ');
      return;
    }
    host.append(h('div', { class: 'detected' }, h('i', { class: 'spin' }), h('span', { text: 'Detecting framework from the repository…' })));
    try {
      const q = new URLSearchParams({ provider: s.provider, repo: s.full_name, root: $('#f-root').value.trim().replace(/^\.\/?$/, '') });
      if (s.branch) q.set('branch', s.branch);
      const d = await api('/repos/detect?' + q);
      if (id !== S.detectId) return;
      if (!S.dirty.has('name') && d.name) $('#f-name').value = slug(d.name) || $('#f-name').value;
      applyDetected(d, d.has_package_json ? 'Detected from package.json: ' : 'No package.json found — treated as ');
    } catch (e) {
      if (id !== S.detectId) return;
      clear(host).append(h('div', { class: 'alert warn' }, h('span', { text: `Couldn't auto-detect settings (${e.message}). Fill them in manually.` }), h('button', { class: 'btn g sm', type: 'button', style: 'margin-left:auto', onclick: detect }, 'Retry')));
    }
  }

  function enterConfigure() {
    const s = S.source;
    const fw = $('#f-fw');
    if (!fw.options.length) Object.entries(FW).forEach(([k, v]) => fw.append(h('option', { value: k, text: v })));
    $('#f-name').value = slug(s.name) || '';
    $('#f-root').value = ''; $('#f-build').value = ''; $('#f-out').value = ''; fw.value = 'other';
    $('#name-hint').className = 'hint'; $('#name-hint').textContent = '2–40 characters: lowercase letters, numbers and hyphens.';
    clear($('#cfg-err'));
    clear($('#envrows')); S.envRows = []; $('#env-paste-box').classList.add('hide');
    addEnvRow();
    const isUp = s.kind === 'upload';
    clear($('#src-head')).append(
      h('span', { class: 'tag', text: isUp ? 'Upload' : LABEL[s.provider] }),
      h('div', { class: 'rm' }, h('b', { text: isUp ? s.name : s.full_name }), h('small', { text: isUp ? `${s.file_count} files · ${fmtBytes(s.bytes)}` : `${s.private ? 'Private' : 'Public'} · branch ${s.branch || 'default'}` })),
      !isUp && safeUrl(s.html_url) && h('a', { class: 'btn g sm', href: safeUrl(s.html_url), target: '_blank', rel: 'noopener' }, 'View repo ↗'));
    const rows = isUp
      ? [['Source', 'Upload'], ['Files', String(s.file_count)], ['Size', fmtBytes(s.bytes)]]
      : [['Source', { import: 'Imported repo', url: 'Public URL', template: 'New from template' }[s.kind]], ['Repository', s.full_name], ['Branch', s.branch || 'default'], ['Visibility', s.private ? 'Private' : 'Public']];
    const ul = clear($('#src-sum'));
    rows.forEach(([k, v]) => ul.append(h('li', {}, h('span', { text: k }), h('b', { text: v }))));
    $('#auto-note').textContent = isUp ? 'Uploads have no git remote, so you redeploy manually from the dashboard.'
      : s.provider === 'github' ? 'A GitHub webhook is registered when you create the project: push → production, pull request → preview.'
      : `Automatic deploys on push are only supported for GitHub. ${LABEL[s.provider]} projects are redeployed manually.`;
    go(2);
    detect();
  }

  // ---------- env vars ----------
  function addEnvRow(k, v) {
    const key = h('input', { class: 'in', placeholder: 'KEY', value: k || '', 'aria-label': 'Variable name', autocomplete: 'off', spellcheck: 'false', maxlength: '64' });
    const val = h('input', { class: 'in', placeholder: 'value', value: v || '', 'aria-label': 'Variable value', autocomplete: 'off', spellcheck: 'false', type: 'password' });
    val.addEventListener('focus', () => (val.type = 'text')); val.addEventListener('blur', () => (val.type = 'password'));
    const row = h('div', { class: 'envrow' }, key, val, h('button', { class: 'x', type: 'button', 'aria-label': 'Remove variable', onclick: () => { row.remove(); S.envRows = S.envRows.filter((r) => r.row !== row); } }, '✕'));
    S.envRows.push({ row, key, val });
    $('#envrows').append(row);
  }
  function parseDotenv(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim().replace(/^export\s+/, '');
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      let v = line.slice(i + 1).trim();
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      out.push([line.slice(0, i).trim(), v]);
    }
    return out;
  }
  function collectEnv() {
    const env = {}, seen = new Set();
    for (const { key, val } of S.envRows) {
      const k = key.value.trim(), v = val.value;
      key.classList.remove('bad');
      if (!k && !v) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) { key.classList.add('bad'); key.focus(); throw new Error(`"${k || '(empty)'}" is not a valid variable name (letters, digits and _, not starting with a digit).`); }
      if (seen.has(k)) { key.classList.add('bad'); throw new Error(`Duplicate variable: ${k}`); }
      if (v.length > 4096) { key.classList.add('bad'); throw new Error(`Value for ${k} is longer than 4096 characters.`); }
      seen.add(k); env[k] = v;
    }
    if (seen.size > 64) throw new Error('Too many environment variables (max 64).');
    return env;
  }

  async function onConfigure(e) {
    e.preventDefault();
    const s = S.source, btn = $('#cfg-go'), err = clear($('#cfg-err')), nameEl = $('#f-name'), nh = $('#name-hint');
    const name = nameEl.value.trim();
    nameEl.classList.remove('bad'); nh.className = 'hint';
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(name)) { nameEl.classList.add('bad'); nh.className = 'hint err'; nh.textContent = 'Use 2–40 characters: lowercase letters, numbers and hyphens, starting with a letter or number.'; nameEl.focus(); return; }
    let env;
    try { env = collectEnv(); } catch (ex) { return void alertBox(err, ex.message, 'err'); }
    const body = { name, source: s.kind, framework: $('#f-fw').value, build_command: $('#f-build').value.trim(), output_dir: $('#f-out').value.trim(), root_dir: $('#f-root').value.trim().replace(/^\.\/?$/, ''), env };
    if (s.kind === 'upload') body.upload_id = s.upload_id; else { body.provider = s.provider; body.repo_full_name = s.full_name; }
    busy(btn, true);
    try {
      const d = await api('/projects', { method: 'POST', body });
      S.project = d.project; S.dep = null;
      enterDeploy();
    } catch (ex) {
      alertBox(err, ex.message, 'err');
      if (ex.status === 401) needAuth('create a project');
    } finally { busy(btn, false); }
  }

  // ---------- step 3: deploy ----------
  function stopPoll() { if (S.poll) { clearTimeout(S.poll.t); S.poll = null; } }

  function enterDeploy(resumeDep) {
    const p = S.project;
    clear($('#proj-head')).append(
      h('span', { class: 'tag', text: p.source === 'upload' ? 'Upload' : LABEL[p.provider] || p.source }),
      h('div', { class: 'rm' }, h('b', { text: p.name }), h('small', { text: p.repo_full_name || 'Uploaded files' })),
      h('span', { class: 'tag mut', text: FW[p.framework] || p.framework || 'Other' }));
    const rows = [['Project', p.name], ['Source', p.repo_full_name || 'Upload'], ['Branch', p.branch || '—'], ['Framework', FW[p.framework] || p.framework], ['Build command', p.build_command || '(none)'], ['Output directory', p.output_dir || '(project root)'], ['Root directory', p.root_dir || '(repository root)'], ['Environment', p.env_keys && p.env_keys.length ? `${p.env_keys.length} variable${p.env_keys.length > 1 ? 's' : ''}: ${p.env_keys.join(', ')}` : 'none']];
    const ul = clear($('#proj-sum'));
    rows.forEach(([k, v]) => ul.append(h('li', {}, h('span', { text: k }), h('b', { text: v }))));
    const wn = clear($('#webhook-note')), ws = p.webhook_status || '';
    if (ws === 'active') alertBox(wn, 'Git push = deploy is active: pushes to the default branch deploy to production, pull requests get previews.', 'ok');
    else if (ws && ws !== 'pending') alertBox(wn, 'Automatic deploys are not active — ' + ws.replace(/^\w+:\s*/, ''), 'warn');
    if (S.cfg && !S.cfg.deploy) alertBox($('#dep-alert'), 'The build pipeline is not configured on this server (DEPLOY_WEBHOOK_URL / DEPLOY_WEBHOOK_SECRET). A deploy will fail until the operator sets it up.', 'warn');
    else clear($('#dep-alert'));
    clear($('#live-box'));
    $('#race-wrap').classList.add('hide');
    renderActs(false);
    go(3);
    if (resumeDep) { showDeployment(resumeDep); if (resumeDep.status === 'queued' || resumeDep.status === 'building') startPoll(resumeDep.id); }
  }

  function renderActs(running, failed) {
    const a = clear($('#dep-acts'));
    const dep = h('button', { class: 'btn p lg', type: 'button', onclick: startDeploy }, failed ? 'Retry deploy ⚡' : 'Deploy to edge ⚡');
    if (!running) a.append(dep);
    a.append(h('a', { class: 'btn g', href: '/dashboard/' }, 'Go to dashboard'), h('a', { class: 'btn g', href: '/new/' }, 'New project'));
  }

  async function startDeploy(e) {
    const btn = e && e.currentTarget;
    if (btn) busy(btn, true);
    clear($('#dep-alert')); clear($('#live-box'));
    try {
      const d = await api(`/projects/${S.project.id}/deploy`, { method: 'POST', body: {} });
      showDeployment(d.deployment);
      startPoll(d.deployment.id);
    } catch (ex) {
      if (ex.code === 'in_progress') {
        try { const pd = await api(`/projects/${S.project.id}`); if (pd.latest_deployment) { alertBox($('#dep-alert'), 'A deployment is already running — showing it.', ''); showDeployment(pd.latest_deployment); startPoll(pd.latest_deployment.id); return; } } catch { /* fall through */ }
      }
      const depId = ex.extra && ex.extra.deployment_id;
      if (depId) { try { const dd = await api('/deployments/' + depId); showDeployment(dd.deployment); renderActs(false, true); } catch { /* shown below */ } }
      alertBox($('#dep-alert'), ex.message, 'err');
      if (!depId) renderActs(false, false);
    } finally { if (btn && btn.isConnected) busy(btn, false); }
  }

  let lastStatus = 'queued';
  function showDeployment(d) {
    S.dep = d;
    $('#race-wrap').classList.remove('hide');
    const legs = $$('#race .lg');
    legs.forEach((l) => (l.className = 'lg'));
    if (d.status === 'queued') legs[0].classList.add('on');
    else if (d.status === 'building') { legs[0].classList.add('done'); legs[1].classList.add('on'); }
    else if (d.status === 'ready') legs.forEach((l) => l.classList.add('done'));
    else { // failed: mark the leg we were on
      const at = lastStatus === 'building' || /build/i.test(d.step || '') ? 1 : 0;
      for (let i = 0; i < at; i++) legs[i].classList.add('done');
      legs[at].classList.add('fail');
    }
    lastStatus = d.status;
    const pre = $('#log'), near = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
    pre.textContent = d.log || '';
    if (near) pre.scrollTop = pre.scrollHeight;
    $('#log-copy').dataset.copy = d.log || '';
    $('#dep-meta').textContent = `${d.environment} · step: ${d.step} · ${d.id.slice(0, 8)}`;
    const active = d.status === 'queued' || d.status === 'building';
    if (d.status === 'ready') {
      const u = safeUrl(d.url);
      clear($('#live-box')).append(h('div', { class: 'live' },
        h('div', {}, h('b', { text: '● Live on the edge' }), u ? h('a', { class: 'u', href: u, target: '_blank', rel: 'noopener', text: u }) : h('span', { class: 'u', text: d.url || '(no URL reported)' })),
        h('div', { class: 'acts' }, u && h('a', { class: 'btn p', href: u, target: '_blank', rel: 'noopener' }, 'Visit site ↗'), h('a', { class: 'btn g', href: '/dashboard/' }, 'Dashboard'))));
      $('#s3-title').textContent = 'You are live.';
      clear($('#dep-alert')); renderActs(false); const first = $('#dep-acts .btn.p'); if (first) first.textContent = 'Deploy again ⚡';
    } else if (d.status === 'failed') {
      const m = /Deploy failed:[^\n]*/.exec(d.log || '');
      alertBox($('#dep-alert'), m ? m[0] : 'Deploy failed. See the log above for details.', 'err');
      $('#s3-title').textContent = 'Deploy failed.';
      renderActs(false, true);
    } else { $('#s3-title').textContent = d.status === 'queued' ? 'Queued…' : 'Building…'; renderActs(true); }
    return active;
  }

  function startPoll(id) {
    stopPoll();
    const st = { id, fails: 0, t: 0, n: 0 };
    S.poll = st;
    const tick = async () => {
      if (S.poll !== st) return;
      try {
        const d = (await api('/deployments/' + id)).deployment;
        st.fails = 0;
        if (S.poll !== st) return;
        if (!showDeployment(d)) { stopPoll(); return; }
      } catch (e) {
        st.fails++;
        if (e.status === 401) { stopPoll(); alertBox($('#dep-alert'), 'Your session expired. Sign in again to keep watching this deployment.', 'warn'); return; }
        if (st.fails >= 3) alertBox($('#dep-alert'), `Lost contact with the API (${e.message}). Retrying…`, 'warn');
      }
      st.n++;
      st.t = setTimeout(tick, st.n > 30 ? 4000 : 2000);
    };
    st.t = setTimeout(tick, 1200);
  }

  async function resumeProject(pid) {
    try {
      const d = await api('/projects/' + encodeURIComponent(pid));
      S.project = d.project;
      enterDeploy(d.latest_deployment || null);
    } catch (e) { alertBox($('#alerts'), `Couldn't open that project: ${e.message}`, 'err'); }
  }

  // ---------- wiring ----------
  function wire() {
    $$('[data-provider]').forEach((b) => b.addEventListener('click', () => login(b.dataset.provider, 'login', NEXT_NEW)));
    let t;
    $('#rsearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value.trim(); loadRepos(true); }, 300); });
    $('#rmore').addEventListener('click', () => { S.page++; $('#rlist').append(h('div', { class: 'skel' })); loadRepos(false); });
    $('#urlform').addEventListener('submit', onUrl);
    $$('#tpl .tc2').forEach((b) => b.addEventListener('click', () => openTemplateForm(b.dataset.template)));
    $('#browse').addEventListener('click', toggleAllTemplates);

    const drop = $('#drop'), dir = $('#file'), zip = $('#zipfile');
    const nope = () => uploadError('Upload is not enabled on this server: no R2 bucket is bound to UPLOADS. Import from Git instead, or see the README to enable uploads.');
    const pick = (el) => () => (S.cfg && !S.cfg.uploads ? nope() : S.user ? el.click() : needAuth('upload a project'));
    $('#pickdir').addEventListener('click', (e) => { e.stopPropagation(); pick(dir)(); });
    $('#pickzip').addEventListener('click', (e) => { e.stopPropagation(); pick(zip)(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(dir)(); } });
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', async (e) => {
      if (S.cfg && !S.cfg.uploads) return nope();
      if (!S.user) return needAuth('upload a project');
      const dt = e.dataTransfer, first = dt.items && dt.items[0] && dt.items[0].webkitGetAsEntry && dt.items[0].webkitGetAsEntry();
      try {
        const items = await fromDrop(dt);
        const zipOnly = items.length === 1 && /\.zip$/i.test(items[0].path);
        await doUpload(items, zipOnly ? items[0].path.replace(/\.zip$/i, '') : first && first.isDirectory && dt.items.length === 1 ? first.name : 'upload');
      } catch (ex) { uploadError('Could not read the dropped items: ' + ex.message); }
    });
    dir.addEventListener('change', () => { const list = [...dir.files]; const root = list[0] && list[0].webkitRelativePath ? list[0].webkitRelativePath.split('/')[0] : 'upload'; doUpload(fromPicker(dir.files), root); dir.value = ''; });
    zip.addEventListener('change', () => { const f = zip.files[0]; if (f) doUpload([{ file: f, path: f.name }], f.name.replace(/\.zip$/i, '')); zip.value = ''; });

    $('#cfgform').addEventListener('submit', onConfigure);
    $('#cfg-back').addEventListener('click', () => go(1));
    $('#env-add').addEventListener('click', () => addEnvRow());
    $('#env-paste').addEventListener('click', () => $('#env-paste-box').classList.toggle('hide'));
    $('#env-add-parsed').addEventListener('click', () => {
      const pairs = parseDotenv($('#env-text').value);
      if (!pairs.length) return toast('No KEY=value lines found.', 'err');
      S.envRows = S.envRows.filter((r) => { if (!r.key.value && !r.val.value) { r.row.remove(); return false; } return true; });
      pairs.forEach(([k, v]) => addEnvRow(k, v));
      $('#env-text').value = ''; $('#env-paste-box').classList.add('hide');
    });
    ['name', 'fw', 'build', 'out'].forEach((k) => $({ name: '#f-name', fw: '#f-fw', build: '#f-build', out: '#f-out' }[k]).addEventListener('input', () => S.dirty.add(k)));
    let rt;
    $('#f-root').addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(() => S.source && S.source.kind !== 'upload' && detect(), 700); });
  }

  async function init() {
    wire();
    const q = new URLSearchParams(location.search);
    if (q.get('auth_error')) { alertBox($('#alerts'), 'Sign-in failed: ' + q.get('auth_error'), 'err'); q.delete('auth_error'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
    const [c, u] = await Promise.all([cfg().catch((e) => { alertBox($('#alerts'), e.message, 'err'); return null; }), me().catch(() => null)]);
    S.cfg = c; S.user = u;
    if (c && !c.uploads) { $('#drop').classList.add('off'); $('#droptxt').textContent = '⇪ Uploads are not enabled on this server'; $('#dropsub').textContent = 'An R2 bucket must be bound to UPLOADS (see the README).'; }
    renderAuthState();
    loadTemplates().then(() => { const t = q.get('template'); if (t && S.user) openTemplateForm(t); else if (t) needAuth('create a repository from a template'); });
    if (u) loadRepos(true);
    if (q.get('project')) { if (u) resumeProject(q.get('project')); else needAuth('open this project'); }
  }
  init();
})();
