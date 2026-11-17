import { parsePatch, render, patchName, diffPatches, renderDiff } from './pd.js';
import { diffFiles } from './udiff.js';

const hashes = new Map();
const hash = (alg, s) => {
  const k = alg + s;
  if (!hashes.has(k)) hashes.set(k, crypto.subtle.digest(alg, new TextEncoder().encode(s)).then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')));
  return hashes.get(k);
};
const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));

// Selectors drift; keep every host-specific bit here.
// diff(path): {root, base, head, url} (or a promise of it) on a commit/PR page, base/head as raw-URL refs;
// file(path): that file's container, header first, diff body second.
const HOSTS = [
  {
    host: /(^|\.)github\.com$/, blob: '/blob/', raw: '/raw/', view: '#highlighted-line-menu-positioner',
    diff(p) {
      const c = /^(\/[^/]+\/[^/]+)\/commit\/([0-9a-f]{7,40})\/?$/.exec(p);
      if (c) return { root: c[1], base: c[2] + '~1', head: c[2], url: `${c[1]}/commit/${c[2]}.diff` };
      const r = /^(\/[^/]+\/[^/]+)\/pull\/\d+\/(files|changes)/.exec(p);
      const url = r && document.querySelector('[data-url*="end_commit_oid="]')?.dataset.url;
      const base = url && /start_commit_oid=([0-9a-f]{40})/.exec(url), head = url && /end_commit_oid=([0-9a-f]{40})/.exec(url);
      return base && head ? { root: r[1], base: base[1], head: head[1], url: `${r[1]}/compare/${base[1]}...${head[1]}.diff` } : null;
    },
    async file(path) {
      const id = 'diff-' + (await hash('SHA-256', path));
      return document.getElementById(id) ?? document.querySelector(`[role=region]:has(a[href="#${id}"])`);
    },
  },
  {
    host: /(^|\.)gitlab\.com$/, blob: '/-/blob/', raw: '/-/raw/',
    // newer GitLab wraps the viewer in a horizontal flex scroller; anchoring inside it lets a zoomed patch scroll the bar away
    view: '.gl-overflow-x-auto:has(> .blob-viewer[data-type]:not([data-type="auxiliary"]):not([hidden])), .file-holder .blob-viewer[data-type]:not([data-type="auxiliary"]):not([hidden])',
    async diff(p) {
      const m = /^(\/.+?)\/-\/(?:commit\/([0-9a-f]{7,40})\/?$|merge_requests\/(\d+)\/diffs)/.exec(p);
      if (!m) return null;
      const api = `/api/v4/projects/${encodeURIComponent(m[1].slice(1))}`;
      if (m[2]) {
        const c = await json(`${api}/repository/commits/${m[2]}`);
        return { root: m[1], base: c.parent_ids[0] ?? null, head: c.id, url: `${m[1]}/-/commit/${c.id}.diff` };
      }
      const { diff_refs: r } = await json(`${api}/merge_requests/${m[3]}`);
      return { root: m[1], base: r.base_sha, head: r.head_sha, url: `${m[1]}/-/merge_requests/${m[3]}.diff` };
    },
    async file(path) {
      const e = document.getElementById(await hash('SHA-1', path));
      return e?.tagName === 'DIFF-FILE' ? e.querySelector('article') : e;
    },
  },
  {
    host: /(^|\.)codeberg\.org$/, blob: '/src/', raw: '/raw/', view: '.file-view',
    async diff(p) {
      const m = /^(\/[^/]+\/[^/]+)\/(?:commit\/([0-9a-f]{7,40})\/?$|pulls\/(\d+)\/files)/.exec(p);
      if (!m) return null;
      const api = '/api/v1/repos' + m[1];
      if (m[2]) {
        const c = await json(`${api}/git/commits/${m[2]}?stat=false&files=false`);
        return { root: m[1], base: c.parents[0] ? 'commit/' + c.parents[0].sha : null, head: 'commit/' + c.sha, url: `${m[1]}/commit/${c.sha}.diff` };
      }
      const pr = await json(`${api}/pulls/${m[3]}`);
      return { root: m[1], base: 'commit/' + pr.merge_base, head: 'commit/' + pr.head.sha, url: `${m[1]}/pulls/${m[3]}.diff` };
    },
    file: async (path) => document.querySelector(`.diff-file-box[data-new-filename="${path.replace(/["\\]/g, '\\$&')}"]`),
  },
];

const store = {
  get: (k) => { try { return localStorage.getItem('pd4git-' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('pd4git-' + k, v); } catch {} },
};

// Self-hosted instances (options page): pick the forge whose blob marker comes first in the path,
// else guess from diff-page markup.
const [GITHUB, GITLAB, GITEA] = HOSTS;
const guessHost = (p) => HOSTS.filter((h) => p.includes(h.blob)).sort((a, b) => p.indexOf(a.blob) - p.indexOf(b.blob))[0]
  ?? (p.includes('/-/') ? GITLAB : document.querySelector('.diff-file-box') ? GITEA : GITHUB);

const get = (url) => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))));
const EMPTY = '#N canvas 0 50 450 300 10;\n';

let pending = null; // { key, text | files }
let found = {}; // diff refs of the current page, so they aren't looked up on every mutation
let asking = '';

function check() {
  const { pathname } = location;
  const h = HOSTS.find((h) => h.host.test(location.hostname)) ?? guessHost(pathname);
  if (found.path !== pathname && asking !== pathname) {
    asking = pathname;
    // a null answer (refs not in the page yet) is retried on the next mutation; a failed lookup isn't
    Promise.resolve(h?.diff?.(pathname)).then((d) => {
      if (asking === pathname) asking = '';
      if (d && location.pathname === pathname) { found = { path: pathname, d }; check(); }
    }, () => {});
  }
  const d = found.path === pathname ? found.d : null;
  const key = d ? `${d.base}..${d.head}` : h && pathname.endsWith('.pd') && pathname.includes(h.blob) ? pathname : '';

  for (const old of document.querySelectorAll('.pd4git')) {
    if (old.dataset.key === key) continue;
    old.nextElementSibling?.style.removeProperty('display');
    old.remove();
  }
  if (!key) return;
  if (d) return checkDiff(h, d, key);
  const view = document.querySelector(h.view);
  if (!view || view.previousElementSibling?.classList.contains('pd4git')) return;

  if (pending?.key !== key) pending = { key, text: get(location.origin + pathname.replace(h.blob, h.raw)) };
  const box = newBox(key);
  view.before(box);
  pending.text.then((text) => {
    const pd = parsePatch(text);
    mount(box, view, pd.rootPatchId, (id) => render(pd, id), (id) => patchName(pd, id), 'Patch');
  }).catch((e) => fail(box, e));
}

function checkDiff(h, d, key) {
  if (pending?.key !== key) {
    const raw = (ref, path) => (path ? get(`${location.origin}${d.root}${h.raw}${ref}/${path.split('/').map(encodeURIComponent).join('/')}`) : EMPTY);
    pending = {
      key,
      files: get(d.url).then((t) => diffFiles(t).filter((f) => (f.newPath ?? f.oldPath).endsWith('.pd')).map((f) => ({
        path: f.newPath ?? f.oldPath,
        load: () => (f.texts ??= Promise.all([raw(d.base, f.oldPath), raw(d.head, f.newPath)])),
      }))),
    };
  }
  const { files } = pending;
  files.then((list) => list.forEach(async (f) => {
    const c = await h.file(f.path);
    if (pending?.files !== files || !c?.children[1] || c.querySelector(':scope > .pd4git')) return;
    const box = newBox(key);
    c.firstElementChild.after(box);
    f.load().then(([a, b]) => {
      const o = parsePatch(a), n = parsePatch(b), diff = diffPatches(o, n);
      const name = (id) => (o.patches[id] ? patchName(o, id) : patchName(n, id));
      mount(box, box.nextElementSibling, n.rootPatchId, (id) => renderDiff(o, n, diff, id), name, 'Diff');
    }).catch((e) => fail(box, e));
  })).catch(() => {});
}

function newBox(key) {
  const box = document.createElement('div');
  box.className = 'pd4git';
  box.dataset.key = key;
  return box;
}

function fail(box, e) {
  box.textContent = `pd4git: couldn't render this patch (${e.message})`;
  box.classList.add('pd4git-error');
}

function mount(box, codeView, root, draw, name, label) {
  const stack = [root];
  let zoom = 1;
  box.innerHTML = `<div class="pd4git-bar">
    <button data-mode="patch">${label}</button><button data-mode="text">Text</button>
    <span class="pd4git-crumbs"></span><span class="pd4git-spacer"></span>
    <button data-zoom="0.8" title="Zoom out">−</button><button data-zoom="1.25" title="Zoom in">+</button>
  </div><div class="pd4git-view"></div>`;
  const view = box.querySelector('.pd4git-view');
  const crumbs = box.querySelector('.pd4git-crumbs');

  const setMode = (mode) => {
    store.set('mode', mode);
    for (const b of box.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', b.dataset.mode === mode);
    view.style.display = mode === 'patch' ? '' : 'none';
    crumbs.style.display = mode === 'patch' ? '' : 'none';
    codeView.style.display = mode === 'patch' ? 'none' : '';
  };
  const redraw = () => {
    view.innerHTML = draw(stack.at(-1));
    const svg = view.firstElementChild;
    svg.style.width = svg.getAttribute('width') * zoom + 'px';
    svg.style.height = svg.getAttribute('height') * zoom + 'px';
    crumbs.replaceChildren(...stack.flatMap((id, i) => {
      const a = document.createElement(i < stack.length - 1 ? 'a' : 'span');
      a.textContent = i ? name(id) : 'main';
      a.dataset.depth = i;
      return i ? [' / ', a] : [a];
    }));
  };

  box.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode], [data-zoom], a[data-depth], [data-patch]');
    if (!t) return;
    if (t.dataset.mode) return setMode(t.dataset.mode);
    if (t.dataset.zoom) zoom *= +t.dataset.zoom;
    else if (t.dataset.depth) stack.length = +t.dataset.depth + 1;
    else stack.push(t.dataset.patch);
    redraw();
  });

  redraw();
  setMode(store.get('mode') || 'patch');
}

new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
check();
