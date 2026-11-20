import { wrap } from './pd.js';

// Max patchers (.maxpat, .maxhelp, .gendsp, .amxd) -> the graph shape pd.js renders and diffs.
// Boxes carry their own rect and iolet counts, so each node gets a ready-made `box` layout.
const CW = 5.5; // ponytail: average char width of 10px sans-serif; text isn't measured, so wrapping is approximate
const SHAPES = { message: 'msg', comment: 'text', 'live.comment': 'text', number: 'atom', flonum: 'atom', panel: 'cnv' };
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

// Max colours are [r, g, b, a] in 0..1.
const rgba = (c) => (Array.isArray(c) && c.length >= 3 && c.every((v) => typeof v === 'number')
  ? `rgba(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(',')},${c[3] ?? 1})` : null);
const at = (name, v) => (v ? ` ${name}="${v}"` : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pt = (a) => a.map((v) => +v.toFixed(2)).join(',');

// ---- interface objects: (rect, box json, max style?) -> svg. Default looks, values aren't stored in the patch.
const body = (r, j, m, cls = 'pd-iem') => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="${cls}"${m ? ' rx="3"' : ''}${at('fill', m && rgba(j.bgcolor ?? j.bgfillcolor_color))}/>`;
const text = (x, y, s, anchor = 'start', size) => `<text x="${x}" y="${y}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${at('font-size', size)}>${esc(s)}</text>`;
const acc = (j, m) => at('stroke', m && rgba(j.color ?? j.activeslidercolor ?? j.activedialcolor));
const param = (j) => j.saved_attribute_attributes?.valueof ?? {};
const shortname = (j) => param(j).parameter_shortname ?? param(j).parameter_longname ?? j.varname ?? '';

function arc(cx, cy, r, from, to) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  return `M${pt(p(from))}A${pt([r, r])} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(p(to))}`;
}
// 270° sweep from bottom-left over the top to bottom-right (plugdata's knob geometry); needle at the minimum.
function knob(cx, cy, r, j, m) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  return `<path d="${arc(cx, cy, r, a0, a1)}" class="pd-line pd-faint" stroke-width="${Math.max(1.5, r / 5)}"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${pt([cx + r * Math.cos(a0)])}" y2="${pt([cy + r * Math.sin(a0)])}" class="pd-line pd-acc" stroke-width="2"${acc(j, m)}/>`;
}

function slider(r, j, m) {
  const hor = r.w > r.h, k = 3;
  return body(r, j, m) + (hor
    ? `<line x1="${r.x + 4}" y1="${r.y + r.h / 2}" x2="${r.x + r.w - 4}" y2="${r.y + r.h / 2}" class="pd-line pd-faint"/><rect x="${r.x + 3}" y="${r.y + 2}" width="${k}" height="${r.h - 4}" class="pd-accf"${at('fill', m && rgba(j.knobcolor))}/>`
    : `<line x1="${r.x + r.w / 2}" y1="${r.y + 4}" x2="${r.x + r.w / 2}" y2="${r.y + r.h - 4}" class="pd-line pd-faint"/><rect x="${r.x + 2}" y="${r.y + r.h - 3 - k}" width="${r.w - 4}" height="${k}" class="pd-accf"${at('fill', m && rgba(j.knobcolor))}/>`);
}

function keyboard(r, j, m) {
  const lo = j.offset ?? 36, n = j.range ?? 61, white = [0, 2, 4, 5, 7, 9, 11];
  const notes = Array.from({ length: n }, (_, i) => lo + i), whites = notes.filter((k) => white.includes(k % 12)).length;
  const kw = r.w / Math.max(whites, 1), out = [body(r, j, m, 'pd-iem pd-keys')];
  let wi = 0;
  for (const k of notes) {
    if (white.includes(k % 12)) { if (wi) out.push(`<line x1="${pt([r.x + wi * kw])}" y1="${r.y}" x2="${pt([r.x + wi * kw])}" y2="${r.y + r.h}" class="pd-line pd-faint"/>`); wi++; }
    else if (wi) out.push(`<rect x="${pt([r.x + wi * kw - kw * 0.3])}" y="${r.y}" width="${pt([kw * 0.6])}" height="${pt([r.h * 0.6])}" class="pd-accf pd-black"/>`);
  }
  return out.join('');
}

function grid(r, j, m, cols, rows) {
  const out = [body(r, j, m)];
  for (let i = 1; i < cols; i++) out.push(`<line x1="${pt([r.x + (r.w * i) / cols])}" y1="${r.y}" x2="${pt([r.x + (r.w * i) / cols])}" y2="${r.y + r.h}" class="pd-line pd-faint"/>`);
  for (let i = 1; i < rows; i++) out.push(`<line x1="${r.x}" y1="${pt([r.y + (r.h * i) / rows])}" x2="${r.x + r.w}" y2="${pt([r.y + (r.h * i) / rows])}" class="pd-line pd-faint"/>`);
  return out.join('');
}

const centered = (r, j, m, s) => body(r, j, m) + text(r.x + r.w / 2, r.y + r.h / 2 + 3.5, s, 'middle');
const s2 = (r) => Math.min(r.w, r.h) / 2;

const GUI = {
  button: (r, j, m) => body(r, j, m) + `<circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" r="${pt([s2(r) * 0.7])}" class="pd-line pd-acc" stroke-width="1.5"${at('stroke', m && rgba(j.outlinecolor))}/>`,
  toggle: (r, j, m) => {
    const i = Math.min(r.w, r.h) * 0.22;
    return body(r, j, m) + `<path d="M${r.x + i},${r.y + i}L${r.x + r.w - i},${r.y + r.h - i}M${r.x + r.w - i},${r.y + i}L${r.x + i},${r.y + r.h - i}" class="pd-line pd-faint" stroke-width="1.5"/>`;
  },
  dial: (r, j, m) => body(r, j, m) + knob(r.x + r.w / 2, r.y + r.h / 2, s2(r) * 0.75, j, m),
  'live.dial': (r, j, m) => {
    const name = shortname(j), top = name ? 12 : 0, rr = Math.max(4, Math.min(r.w, r.h - top - 12) / 2 * 0.8);
    return (name ? text(r.x + r.w / 2, r.y + 9, name, 'middle', 9) : '') + knob(r.x + r.w / 2, r.y + top + rr + 2, rr, j, m) + text(r.x + r.w / 2, r.y + r.h - 2, '0', 'middle', 9);
  },
  slider: slider, 'live.slider': slider, 'gain~': slider, 'live.gain~': slider, rslider: slider,
  'mc.gain~': slider, 'mc.live.gain~': slider,
  kslider: keyboard,
  'live.numbox': (r, j, m) => centered(r, j, m, '0'),
  'number~': (r, j, m) => body(r, j, m) + `<polygon class="pd-accf" points="${r.x + 3},${r.y + r.h / 2 - 4} ${r.x + 8},${r.y + r.h / 2} ${r.x + 3},${r.y + r.h / 2 + 4}"/>` + text(r.x + 11, r.y + r.h / 2 + 3.5, '0.'),
  'live.text': (r, j, m) => centered(r, j, m, j.text ?? shortname(j)),
  textbutton: (r, j, m) => centered(r, j, m, j.text ?? 'Button'),
  'live.toggle': (r, j, m) => body(r, j, m),
  'live.button': (r, j, m) => body(r, j, m) + `<circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" r="${pt([s2(r) * 0.6])}" class="pd-line pd-acc"/>`,
  umenu: (r, j, m) => body(r, j, m) + text(r.x + 4, r.y + r.h / 2 + 3.5, j.items?.[0] ?? '') + `<polygon class="pd-accf" points="${r.x + r.w - 10},${r.y + r.h / 2 - 2} ${r.x + r.w - 4},${r.y + r.h / 2 - 2} ${r.x + r.w - 7},${r.y + r.h / 2 + 2}"/>`,
  'live.menu': (r, j, m) => GUI.umenu(r, { ...j, items: [param(j).parameter_enum?.[0] ?? ''] }, m),
  'live.tab': (r, j, m) => {
    const items = param(j).parameter_enum ?? [], cols = Math.max(items.length, 1);
    return grid(r, j, m, cols, 1) + items.map((s, i) => text(r.x + (r.w * (i + 0.5)) / cols, r.y + r.h / 2 + 3.5, s, 'middle', 9)).join('');
  },
  tab: (r, j, m) => GUI['live.tab'](r, { ...j, saved_attribute_attributes: { valueof: { parameter_enum: j.tabs } } }, m),
  radiogroup: (r, j, m) => {
    const n = j.size ?? 2, step = r.h / n;
    return Array.from({ length: n }, (_, i) => `<circle cx="${r.x + 7}" cy="${pt([r.y + step * (i + 0.5)])}" r="5" class="pd-iem"/>`).join('');
  },
  matrixctrl: (r, j, m) => grid(r, j, m, j.columns ?? 8, j.rows ?? 4),
  multislider: (r, j, m) => grid(r, j, m, Math.min(j.size ?? 1, 64), 1),
  'ezdac~': (r, j, m) => body(r, j, m) + `<circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" r="${pt([s2(r) * 0.55])}" class="pd-line pd-acc"/><line x1="${r.x + r.w / 2}" y1="${pt([r.y + r.h / 2 - s2(r) * 0.75])}" x2="${r.x + r.w / 2}" y2="${r.y + r.h / 2}" class="pd-line pd-acc" stroke-width="1.5"/>`,
  'scope~': (r, j, m) => body(r, j, m) + `<line x1="${r.x}" y1="${r.y + r.h / 2}" x2="${r.x + r.w}" y2="${r.y + r.h / 2}" class="pd-line pd-faint"/>`,
  'meter~': (r, j, m) => body(r, j, m),
  led: (r, j, m) => `<circle cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" r="${pt([s2(r) - 1])}" class="pd-iem"/>`,
  inlet: (r, j, m) => body(r, j, m) + `<path d="M${r.x + r.w / 2},${r.y + r.h * 0.25}V${r.y + r.h * 0.75}M${r.x + r.w * 0.3},${r.y + r.h * 0.55}L${r.x + r.w / 2},${r.y + r.h * 0.75}L${r.x + r.w * 0.7},${r.y + r.h * 0.55}" class="pd-line pd-acc" stroke-width="1.5"/>`,
  panel: (r, j, m) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="pd-panel" rx="${m ? j.rounded ?? 8 : 0}"${at('fill', m && rgba(j.bgfillcolor_color ?? j.bgcolor))}${at('stroke', m && j.border && rgba(j.bordercolor))}/>`,
};
GUI.outlet = GUI.inlet;
GUI['ezadc~'] = GUI['ezdac~'];
GUI['spectroscope~'] = GUI['scope~'];
GUI['levelmeter~'] = GUI['live.meter~'] = GUI['mc.meter~'] = GUI['meter~'];
GUI['live.step'] = GUI.matrixctrl;

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
    const gui = b.maxclass !== 'newobj' && GUI[b.maxclass];
    const r = { x, y, w, h };
    patch.nodes[b.id] = {
      id: b.id, type, args, nodeClass: sub ? 'subpatch' : 'control', patchId: sub, layout: { x, y }, outtypes: b.outlettype ?? [],
      box: {
        x, y, w, h, shape,
        lines: shape === 'atom' ? [b.maxclass === 'flonum' ? '0.' : '0'] : b.text != null ? wrap(b.text, chars) : [[type, ...args].join(' ').slice(0, chars)],
        inlets: shape === 'text' ? 0 : b.numinlets ?? 0, outlets: b.numoutlets ?? 0,
        fill: rgba(b.bgcolor ?? b.bgfillcolor_color), textFill: rgba(b.textcolor),
        draw: gui ? (style) => gui(r, b, style === 'max') : undefined,
      },
    };
  }
  for (const { patchline: l } of p.lines ?? []) {
    patch.connections.push({ source: { nodeId: l.source[0], portletId: l.source[1] }, sink: { nodeId: l.destination[0], portletId: l.destination[1] }, points: l.midpoints });
  }
  return id;
}

export function parseMaxPatch(text) {
  const pd = { patches: {}, fontSize: 10 };
  pd.rootPatchId = addPatcher(pd, patcherJson(text).patcher);
  return pd;
}
