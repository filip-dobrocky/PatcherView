import { wrap } from './pd.js';

// Max patchers (.maxpat, .maxhelp, .gendsp, .amxd) -> the graph shape pd.js renders and diffs.
// Boxes carry their own rect and iolet counts, so each node gets a ready-made `box` layout.
const CW = 5.5; // ponytail: average char width of 10px sans-serif; text isn't measured, so wrapping is approximate
const SHAPES = { message: 'msg', comment: 'text', button: 'bng', toggle: 'tgl', number: 'atom', flonum: 'atom', panel: 'cnv' };
let seq = 0; // patch ids stay unique across parses, like the Pd parser's

// .amxd wraps the JSON in binary chunks (ampf/meta/ptch), and frozen devices append their dependencies after it.
function patcherJson(text) {
  const start = text.search(/\{\s*"patcher"/);
  let depth = 0, str = false;
  for (let i = start; i >= 0 && i < text.length; i++) {
    const c = text[i];
    if (str) { if (c === '\\') i++; else if (c === '"') str = false; }
    else if (c === '"') str = true;
    else if (c === '{') depth++;
    else if (c === '}' && !--depth) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('no Max patcher found');
}

function addPatcher(pd, p) {
  const id = 'max' + seq++;
  const patch = (pd.patches[id] = { id, nodes: {}, connections: [] });
  for (const { box: b } of p.boxes ?? []) {
    const [x, y, w, h] = b.patching_rect ?? [0, 0, 20, 20];
    const words = String(b.text ?? '').split(/\s+/).filter(Boolean);
    const type = b.maxclass === 'newobj' ? words.shift() ?? '' : b.maxclass === 'message' ? 'msg' : b.maxclass === 'comment' ? 'text' : b.maxclass;
    const args = b.maxclass === 'bpatcher' && b.name ? [b.name] : words;
    const shape = SHAPES[b.maxclass] ?? 'box';
    const chars = Math.max(1, Math.floor((w - 4) / CW));
    const sub = b.patcher ? addPatcher(pd, b.patcher) : undefined;
    patch.nodes[b.id] = {
      id: b.id, type, args, nodeClass: sub ? 'subpatch' : 'control', patchId: sub, layout: { x, y }, outtypes: b.outlettype ?? [],
      box: {
        x, y, w, h, shape,
        lines: shape === 'atom' ? ['0'] : b.text != null ? wrap(b.text, chars) : [[type, ...args].join(' ').slice(0, chars)],
        inlets: shape === 'text' ? 0 : b.numinlets ?? 0, outlets: b.numoutlets ?? 0,
      },
    };
  }
  for (const { patchline: l } of p.lines ?? []) {
    patch.connections.push({ source: { nodeId: l.source[0], portletId: l.source[1] }, sink: { nodeId: l.destination[0], portletId: l.destination[1] } });
  }
  return id;
}

export function parseMaxPatch(text) {
  const pd = { patches: {}, fontSize: 10, max: true };
  pd.rootPatchId = addPatcher(pd, patcherJson(text).patcher);
  return pd;
}
