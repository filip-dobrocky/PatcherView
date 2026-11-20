import { parsePatch, render, patchName, diffPatches, renderDiff } from '../src/pd.js';
import { parseMaxPatch } from '../src/max.js';
import { mount } from '../src/view.js';
import '../src/style.css';

const vscode = acquireVsCodeApi();
const parse = (kind, t) => (kind === 'pd' ? parsePatch(t || '#N canvas 0 50 450 300 10;\n') : parseMaxPatch(t || '{"patcher":{}}'));

// msg: {kind, state, text} for a file, {kind, state, old, new} for a diff
window.addEventListener('message', ({ data: m }) => {
  const box = document.createElement('div');
  box.className = 'patcherview';
  document.body.replaceChildren(box);
  const store = {
    get: (k) => m.state[k],
    set: (k, v) => { m.state[k] = v; vscode.postMessage({ set: k, value: v }); },
  };
  try {
    if (m.text !== undefined) {
      const pd = parse(m.kind, m.text);
      mount(box, { store, kind: m.kind, label: 'Patch', root: pd.rootPatchId, draw: (id, s) => render(pd, id, s), name: (id) => patchName(pd, id), onText: () => vscode.postMessage({ text: true }) });
    } else {
      const o = parse(m.kind, m.old), n = parse(m.kind, m.new), diff = diffPatches(o, n);
      const name = (id) => (o.patches[id] ? patchName(o, id) : patchName(n, id));
      mount(box, { store, kind: m.kind, label: 'Diff', root: n.rootPatchId, draw: (id, s) => renderDiff(o, n, diff, id, s), name, onText: () => vscode.postMessage({ text: true }) });
    }
  } catch (e) {
    box.textContent = `PatcherView: couldn't render this patch (${e.message})`;
  }
});
vscode.postMessage({ ready: true });
