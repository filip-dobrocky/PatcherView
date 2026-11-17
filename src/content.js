import { parsePatch, render, patchName } from './pd.js';

// Selectors drift; keep every host-specific bit here.
const HOSTS = [
  { host: /(^|\.)github\.com$/, blob: '/blob/', raw: '/raw/', view: '#highlighted-line-menu-positioner' },
  { host: /(^|\.)gitlab\.com$/, blob: '/-/blob/', raw: '/-/raw/', view: '.file-holder .blob-viewer[data-type]:not([data-type="auxiliary"]):not([hidden])' },
  { host: /(^|\.)codeberg\.org$/, blob: '/src/', raw: '/raw/', view: '.file-view' },
];

const store = {
  get: (k) => { try { return localStorage.getItem('pd4git-' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('pd4git-' + k, v); } catch {} },
};

let pending = null; // { key, text: Promise<string> }

function check() {
  const h = HOSTS.find((h) => h.host.test(location.hostname));
  const { pathname } = location;
  const key = h && pathname.endsWith('.pd') && pathname.includes(h.blob) ? pathname : '';

  for (const old of document.querySelectorAll('.pd4git')) {
    if (old.dataset.key === key) continue;
    old.nextElementSibling?.style.removeProperty('display');
    old.remove();
  }
  if (!key) return;
  const view = document.querySelector(h.view);
  if (!view || view.previousElementSibling?.classList.contains('pd4git')) return;

  if (pending?.key !== key) {
    pending = { key, text: fetch(location.origin + pathname.replace(h.blob, h.raw)).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))) };
  }
  const box = document.createElement('div');
  box.className = 'pd4git';
  box.dataset.key = key;
  view.before(box);
  pending.text.then((text) => mount(box, view, parsePatch(text))).catch((e) => {
    box.textContent = `pd4git: couldn't render this patch (${e.message})`;
    box.classList.add('pd4git-error');
  });
}

function mount(box, codeView, pd) {
  const stack = [pd.rootPatchId];
  let zoom = 1;
  box.innerHTML = `<div class="pd4git-bar">
    <button data-mode="patch">Patch</button><button data-mode="text">Text</button>
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
  const draw = () => {
    view.innerHTML = render(pd, stack.at(-1));
    const svg = view.firstElementChild;
    svg.style.width = svg.getAttribute('width') * zoom + 'px';
    svg.style.height = svg.getAttribute('height') * zoom + 'px';
    crumbs.replaceChildren(...stack.flatMap((id, i) => {
      const a = document.createElement(i < stack.length - 1 ? 'a' : 'span');
      a.textContent = i ? patchName(pd, id) : 'main';
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
    draw();
  });

  draw();
  setMode(store.get('mode') || 'patch');
}

new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
check();
