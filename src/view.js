// kind 'pd' | 'max': each remembers its own drawing style, defaulting to its native one.
// codeView: the source view the Text button swaps in; without one the Text button calls onText.
export function mount(box, { root, draw, name, label, kind, store, codeView, onText }) {
  const stack = [root];
  let zoom = 1, style = store.get('style-' + kind) || kind;
  box.innerHTML = `<div class="patcherview-bar">
    <button data-mode="patch">${label}</button><button data-mode="text">Text</button>
    <span class="patcherview-crumbs"></span><span class="patcherview-spacer"></span>
    <button data-style="pd" title="Draw like Pure Data">Pd</button><button data-style="max" title="Draw like Max">Max</button>
    <button data-zoom="0.8" title="Zoom out">−</button><button data-zoom="1.25" title="Zoom in">+</button>
  </div><div class="patcherview-view"></div>`;
  const view = box.querySelector('.patcherview-view');
  const crumbs = box.querySelector('.patcherview-crumbs');

  const setMode = (mode) => {
    if (!codeView) return mode === 'text' ? onText?.() : null;
    store.set('mode', mode);
    for (const b of box.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', b.dataset.mode === mode);
    view.style.display = mode === 'patch' ? '' : 'none';
    crumbs.style.display = mode === 'patch' ? '' : 'none';
    codeView.style.display = mode === 'patch' ? 'none' : '';
  };
  const redraw = () => {
    box.dataset.style = style;
    for (const b of box.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', b.dataset.style === style);
    view.innerHTML = draw(stack.at(-1), style);
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
    const t = e.target.closest('[data-mode], button[data-style], [data-zoom], a[data-depth], [data-patch]');
    if (!t) return;
    if (t.dataset.mode) return setMode(t.dataset.mode);
    if (t.dataset.style) store.set('style-' + kind, (style = t.dataset.style));
    else if (t.dataset.zoom) zoom *= +t.dataset.zoom;
    else if (t.dataset.depth) stack.length = +t.dataset.depth + 1;
    else stack.push(t.dataset.patch);
    redraw();
  });

  redraw();
  setMode(codeView ? store.get('mode') || 'patch' : null);
  if (!codeView) box.querySelector('[data-mode="patch"]').setAttribute('aria-pressed', true);
}

