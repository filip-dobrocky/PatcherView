import parse from '@webpd/pd-parser';

// Pd vanilla font metrics at zoom 1 (s_main.c sys_fontspec): size -> [charWidth, lineHeight]
const FONTS = { 8: [5, 11], 10: [6, 13], 12: [7, 16], 16: [10, 19], 24: [14, 29], 36: [22, 44] };
const IOWIDTH = 7, IOHEIGHT = 3, LMARGIN = 2, TMARGIN = 3, BMARGIN = 2, WRAP = 60;

// ponytail: hand table of common vanilla objects; unknown ones (abstractions, externals)
// only get the iolets seen in connections. Grow on demand.
const B = [2, 1];
const IO = {
  '+': B, '-': B, '*': B, '/': B, max: B, min: B, pow: B, mod: B, div: B, '%': B,
  '==': B, '!=': B, '>': B, '<': B, '>=': B, '<=': B, '&&': B, '||': B, '&': B, '|': B, '<<': B, '>>': B,
  '+~': B, '-~': B, '*~': B, '/~': B, 'max~': B, 'min~': B, 'pow~': B,
  'osc~': B, 'phasor~': B, 'cos~': [1, 1], 'tabosc4~': [2, 1], 'noise~': [1, 1], 'sig~': [1, 1],
  'lop~': B, 'hip~': B, 'bp~': [3, 1], 'vcf~': [3, 2], 'line~': B, 'vline~': [3, 1], line: [3, 1],
  'snapshot~': [1, 1], 'env~': [1, 1], 'clip~': [3, 1], 'abs~': [1, 1], 'wrap~': [1, 1],
  'tabread4~': B, 'tabread~': B, 'tabwrite~': [1, 0], 'tabplay~': [1, 2], 'tabreceive~': [1, 1],
  'delwrite~': [1, 0], 'delread~': B, 'delread4~': [1, 1], 'vd~': [1, 1],
  'fft~': [2, 2], 'ifft~': [2, 2], 'rfft~': [1, 2], 'rifft~': [2, 1],
  'send~': [1, 0], 's~': [1, 0], 'receive~': [1, 1], 'r~': [1, 1], 'throw~': [1, 0], 'catch~': [1, 1],
  'inlet~': [0, 1], 'outlet~': [1, 0], 'block~': [1, 0], 'switch~': [1, 0], 'samplerate~': [1, 1],
  metro: B, delay: B, del: B, timer: [2, 1], float: B, f: B, int: B, i: B, symbol: B, bang: [1, 1], b: [1, 1],
  print: [1, 0], inlet: [0, 1], outlet: [1, 0], loadbang: [1, 1], moses: [2, 2], spigot: B,
  change: [1, 1], random: B, mtof: [1, 1], ftom: [1, 1], dbtorms: [1, 1], rmstodb: [1, 1], abs: [1, 1],
  sqrt: [1, 1], wrap: [1, 1], clip: [3, 1], tabread: [1, 1], tabwrite: [2, 0], until: B, value: [1, 1],
  v: [1, 1], swap: [2, 2], makenote: [3, 2], stripnote: [2, 2], notein: [1, 3], noteout: [3, 0],
  ctlin: [1, 3], ctlout: [3, 0], bendin: [1, 2], bendout: [2, 0], pgmin: [1, 2], pgmout: [2, 0],
  netsend: [1, 2], netreceive: [1, 2], key: [0, 1], keyup: [0, 1], keyname: [0, 2],
};
const nargs = (n) => Math.max(n.args.length, 2);
const IO_FN = {
  'dac~': (n) => [n.args.length || 2, 0], 'adc~': (n) => [1, n.args.length || 2],
  send: (n) => [n.args.length ? 1 : 2, 0], s: (n) => [n.args.length ? 1 : 2, 0],
  receive: (n) => [n.args.length ? 0 : 1, 1], r: (n) => [n.args.length ? 0 : 1, 1],
  pack: (n) => [nargs(n), 1], unpack: (n) => [1, nargs(n)], trigger: (n) => [1, nargs(n)], t: (n) => [1, nargs(n)],
  route: (n) => [n.args.length === 1 ? 2 : 1, n.args.length + 1], select: (n) => [n.args.length > 1 ? 1 : 2, Math.max(n.args.length, 1) + 1],
  sel: (n) => [n.args.length > 1 ? 1 : 2, Math.max(n.args.length, 1) + 1],
  'readsf~': (n) => [1, (+n.args[0] || 1) + 1], 'writesf~': (n) => [+n.args[0] || 1, 0],
};
// outlets of these "~" objects carry control data, not signal
const CONTROL_OUT = new Set(['snapshot~', 'env~', 'bonk~', 'sigmund~', 'fiddle~', 'threshold~', 'tabplay~', 'readsf~']);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COMMA = 'pd4git_comma', COMMA_RE = / ?pd4git_comma/g;
const unescape = (s) => String(s).replace(/\\(.)/g, '$1');
const blank = (s) => !s || s === 'empty' || s === '-';

// tokens -> display text the way Pd shows it: "a , b" -> "a, b", "; x" -> ";\nx"
function displayText(tokens) {
  return tokens.map(unescape).join(' ').replace(COMMA_RE, ',').replace(/ ?; ?/g, ';\n').replace(/^\n|\n$/g, '');
}

export function wrap(text, maxChars) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > maxChars) { out.push(line); line = ''; }
      line = line ? line + ' ' + word : word;
      while (line.length > maxChars) { out.push(line.slice(0, maxChars)); line = line.slice(maxChars); }
    }
    out.push(line);
  }
  return out;
}

// Pd's parser drops the canvas font size; it's the last token of the first line.
export function fontSize(text) {
  const m = /^#N canvas(?:\s+\S+){4}\s+(\d+)/.exec(text);
  const size = m ? +m[1] : 10;
  return FONTS[size] ? size : 10;
}

export function parsePatch(text) {
  // the parser treats an escaped "\," as the ", f N" suffix separator; hide it from it
  const r = parse(text.replace(/\\,/g, COMMA));
  if (r.status !== 0) throw new Error('pd4git: cannot parse patch');
  r.pd.fontSize = fontSize(text);
  return r.pd;
}

// Returns {x, y, w, h, lines?, shape, inlets, outlets, signalOut(i)} for one node.
function layoutNode(pd, patch, n, [cw, lh]) {
  const { x, y } = n.layout;
  const L = n.layout;
  const base = { x, y, shape: 'box', inlets: 0, outlets: 0 };
  const sr = n.args.slice(-2);
  const iem = (w, h, inl = 1, outl = 1) => ({ ...base, w, h, shape: n.type, inlets: blank(sr[0]) ? inl : 0, outlets: blank(sr[1]) ? outl : 0 });

  switch (n.type) {
    case 'bng': return iem(L.size, L.size);
    case 'tgl': return iem(L.size, L.size);
    case 'hsl': case 'vsl': return iem(L.width, L.height);
    case 'hradio': return iem(L.size * n.args[0], L.size);
    case 'vradio': return iem(L.size, L.size * n.args[0]);
    case 'nbx': return iem(L.widthInChars * cw + L.height / 2 + 4, L.height);
    case 'vu': return { ...base, w: L.width, h: L.height, shape: 'vu', inlets: blank(n.args[0]) ? 2 : 0, outlets: 2 };
    case 'cnv': return { ...base, w: L.width, h: L.height, shape: 'cnv' };
  }
  if (n.type === 'floatatom' || n.type === 'symbolatom' || n.type === 'listbox') {
    const chars = L.widthInChars || 5;
    return { ...base, w: chars * cw + 2 * LMARGIN + 2, h: lh + TMARGIN + BMARGIN, shape: 'atom', lines: [n.type === 'symbolatom' ? 'symbol' : '0'], inlets: blank(n.args[2]) ? 1 : 0, outlets: blank(n.args[3]) ? 1 : 0 };
  }
  if (n.nodeClass === 'subpatch') {
    const sub = pd.patches[n.patchId];
    if (sub.layout.graphOnParent) {
      const arrays = Object.values(sub.nodes).filter((c) => c.nodeClass === 'array').map((c) => pd.arrays[c.arrayId]);
      const label = arrays.length ? arrays.map((a) => a.args[0]).join(' ') : sub.layout.hideObjectNameAndArguments ? '' : displayText([n.type, ...n.args]);
      return { ...base, w: sub.layout.viewportWidth, h: sub.layout.viewportHeight, shape: 'gop', label, arrays, inlets: sub.inlets.length, outlets: sub.outlets.length };
    }
    return objBox(base, [n.type, ...n.args], L.width, cw, lh, sub.inlets.length, sub.outlets.length, 'box');
  }
  if (n.type === 'text') {
    const lines = wrap(displayText(n.args), L.width || WRAP);
    return { ...base, w: Math.max(...lines.map((l) => l.length)) * cw + 2 * LMARGIN, h: lines.length * lh + TMARGIN + BMARGIN, shape: 'text', lines };
  }
  if (n.type === 'msg') return objBox(base, n.args, L.width, cw, lh, 1, 1, 'msg');
  const io = IO_FN[n.type]?.(n) ?? IO[n.type] ?? [0, 0];
  return objBox(base, [n.type, ...n.args], L.width, cw, lh, io[0], io[1], 'box');
}

function objBox(base, tokens, width, cw, lh, inlets, outlets, shape) {
  const lines = wrap(displayText(tokens), width || WRAP);
  const chars = width || Math.max(3, ...lines.map((l) => l.length));
  return { ...base, w: chars * cw + 2 * LMARGIN + 1, h: lines.length * lh + TMARGIN + BMARGIN, shape, lines, inlets, outlets };
}

const ioX = (b, i, n) => b.x + (n > 1 ? ((b.w - IOWIDTH) * i) / (n - 1) : 0);

function isSignalOut(pd, n, outlet) {
  if (n.outtypes) return /signal/.test(n.outtypes[outlet] ?? '');
  if (n.nodeClass === 'subpatch') {
    const sub = pd.patches[n.patchId];
    return sub.nodes[sub.outlets[outlet]]?.type === 'outlet~';
  }
  return n.type.endsWith('~') && !CONTROL_OUT.has(n.type) || n.type === 'adc~';
}

// Only plain #rrggbb colors pass; old-style numeric Pd colors fall back to the theme.
// In Max style Pd's default iemgui colours (#fcfcfc body, black lines/labels) count as unset, so the theme shows.
const color = (c, max) => (/^#[0-9a-f]{6}$/i.test(c) && !(max && /^#(fcfcfc|000000)$/i.test(c)) ? c : null);
const attr = (name, v) => (v ? ` ${name}="${v}"` : '');

function drawText(b, lines, [, lh], fill) {
  return lines.map((l, i) => `<text x="${b.x + LMARGIN}" y="${b.y + TMARGIN + lh * i + lh * 0.75}"${attr('fill', fill)}>${esc(l)}</text>`).join('');
}

function drawLabel(n, b, max) {
  const L = n.layout;
  if (blank(L.label)) return '';
  return `<text x="${b.x + (L.labelX ?? 0)}" y="${b.y + (L.labelY ?? 0)}" font-size="${+L.labelFontSize || 10}" dominant-baseline="middle"${attr('fill', color(L.labelColor, max))}>${esc(unescape(L.label))}</text>`;
}

// style 'max' draws boxes the way Max does (rounded, its own message/number look); colours come from CSS.
function drawNode(pd, n, b, metrics, style) {
  if (b.draw) return b.draw(style);
  const { x, y, w, h } = b;
  const max = style === 'max';
  const R = (cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"${max ? ' rx="3"' : ''}${cls === 'pd-iem' ? attr('fill', color(n.layout.bgColor, max)) : attr('fill', max && b.fill)}/>`;
  const T = (bb = b) => drawText(bb, bb.lines, metrics, max && b.textFill);
  const fg = attr('stroke', color(n.layout.fgColor, max));
  switch (b.shape) {
    case 'text': return `<g class="pd-comment">${T()}</g>`;
    case 'msg': {
      if (max) return `${R('pd-box pd-msg')}${T()}`;
      const c = Math.min(4, h / 4);
      return `<polygon class="pd-box pd-msg" points="${x},${y} ${x + w + c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w + c},${y + h} ${x},${y + h}"/>${T()}`;
    }
    case 'atom': {
      if (max) return `${R('pd-box')}<polygon class="pd-accf" points="${x + 3},${y + h / 2 - 4} ${x + 8},${y + h / 2} ${x + 3},${y + h / 2 + 4}"/>${T({ ...b, x: x + 8 })}${drawLabel(n, b, max)}`;
      const c = 4;
      return `<polygon class="pd-box" points="${x},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h} ${x},${y + h}"/>${T()}${drawLabel(n, b, max)}`;
    }
    case 'box': {
      const sub = n.nodeClass === 'subpatch' ? ` data-patch="${esc(n.patchId)}"` : '';
      return `<g class="pd-obj${sub ? ' pd-sub' : ''}"${sub}>${R('pd-box')}${T()}</g>`;
    }
    case 'gop': {
      const plots = b.arrays.map((a) => plotArray(a, b)).join('');
      return `<g class="pd-sub" data-patch="${esc(n.patchId)}">${R('pd-box')}${plots}${b.label ? `<text x="${x + 2}" y="${y - 3}">${esc(b.label)}</text>` : ''}</g>`;
    }
    case 'bng': return `${R('pd-iem')}<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 1}" class="pd-line"${fg}/>${drawLabel(n, b, max)}`;
    case 'tgl': return `${R('pd-iem')}${drawLabel(n, b, max)}`;
    case 'hsl': return `${R('pd-iem')}<line x1="${x + 1}" y1="${y}" x2="${x + 1}" y2="${y + h}" class="pd-line" stroke-width="3"${fg}/>${drawLabel(n, b, max)}`;
    case 'vsl': return `${R('pd-iem')}<line x1="${x}" y1="${y + h - 1}" x2="${x + w}" y2="${y + h - 1}" class="pd-line" stroke-width="3"${fg}/>${drawLabel(n, b, max)}`;
    case 'hradio': case 'vradio': {
      const s = n.layout.size, cells = [];
      for (let i = 1; i < n.args[0]; i++) cells.push(b.shape === 'hradio' ? `<line x1="${x + i * s}" y1="${y}" x2="${x + i * s}" y2="${y + h}" class="pd-line"/>` : `<line x1="${x}" y1="${y + i * s}" x2="${x + w}" y2="${y + i * s}" class="pd-line"/>`);
      return `${R('pd-iem')}${cells.join('')}${drawLabel(n, b, max)}`;
    }
    case 'nbx': {
      const t = h / 2;
      return `${R('pd-iem')}<polyline points="${x},${y} ${x + t},${y + t} ${x},${y + h}" class="pd-line"${fg}/><text x="${x + t + 2}" y="${y + h * 0.75}">0</text>${drawLabel(n, b, max)}`;
    }
    case 'vu': return `${R('pd-iem')}${drawLabel(n, b, max)}`;
    case 'cnv': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color(n.layout.bgColor) || '#e0e0e0'}"/>${drawLabel(n, b, max)}`;
  }
  return '';
}

// ponytail: y range assumed -1..1 (the parser drops #X coords ranges)
function plotArray(a, b) {
  if (!a.data?.length) return '';
  const n = a.data.length, pts = a.data.map((v, i) => `${b.x + (b.w * i) / Math.max(n - 1, 1)},${b.y + (b.h * (1 - Math.max(-1, Math.min(1, v)))) / 2}`);
  return `<polyline points="${pts.join(' ')}" class="pd-line"/>`;
}

// mark.node(id) / mark.cord(i): extra class for that item, or null to lay it out without drawing it.
function drawPatch(pd, patchId, mark = {}, style = 'pd') {
  const patch = pd.patches[patchId];
  const metrics = FONTS[pd.fontSize || 10];
  const nodeCls = mark.node ?? (() => ''), cordCls = mark.cord ?? (() => '');
  const boxes = {};
  for (const n of Object.values(patch.nodes)) {
    if (n.nodeClass === 'array') continue;
    boxes[n.id] = n.box ? { ...n.box } : layoutNode(pd, patch, n, metrics);
  }
  for (const c of patch.connections) {
    const s = boxes[c.source.nodeId], t = boxes[c.sink.nodeId];
    if (s) s.outlets = Math.max(s.outlets, c.source.portletId + 1);
    if (t) t.inlets = Math.max(t.inlets, c.sink.portletId + 1);
  }

  const parts = [], drawn = [];
  // canvases go underneath everything else, like in Pd
  const ordered = Object.values(patch.nodes).filter((n) => boxes[n.id]).sort((a, b) => (boxes[b.id].shape === 'cnv') - (boxes[a.id].shape === 'cnv'));
  for (const n of ordered) {
    const cls = nodeCls(n.id);
    if (cls === null) continue;
    const b = boxes[n.id];
    drawn.push(b);
    if (cls) parts.push(`<g class="${cls}">`);
    parts.push(drawNode(pd, n, b, metrics, style));
    const rx = style === 'max' ? ' rx="1.5"' : '';
    for (let i = 0; i < b.inlets; i++) parts.push(`<rect class="pd-io" x="${ioX(b, i, b.inlets)}" y="${b.y}" width="${IOWIDTH}" height="${IOHEIGHT}"${rx}/>`);
    for (let i = 0; i < b.outlets; i++) parts.push(`<rect class="pd-io" x="${ioX(b, i, b.outlets)}" y="${b.y + b.h - IOHEIGHT + 1}" width="${IOWIDTH}" height="${IOHEIGHT - 1}"${rx}/>`);
    if (cls) parts.push('</g>');
  }
  patch.connections.forEach((c, ci) => {
    const s = boxes[c.source.nodeId], t = boxes[c.sink.nodeId];
    const cls = cordCls(ci);
    if (!s || !t || cls === null) return;
    const sig = isSignalOut(pd, patch.nodes[c.source.nodeId], c.source.portletId);
    const x1 = ioX(s, c.source.portletId, s.outlets) + IOWIDTH / 2, y1 = s.y + s.h;
    const x2 = ioX(t, c.sink.portletId, t.inlets) + IOWIDTH / 2, y2 = t.y;
    parts.push(`<polyline class="pd-cord${sig ? ' pd-sig' : ''}${cls ? ' ' + cls : ''}" points="${[x1, y1, ...(c.points ?? []), x2, y2].join(' ')}"/>`);
  });
  return { parts, drawn };
}

function svg(drawn, parts, pd) {
  const pad = 10;
  const minX = Math.min(0, ...drawn.map((b) => b.x)) - pad, minY = Math.min(0, ...drawn.map((b) => b.y - (b.shape === 'gop' ? 15 : 0))) - pad;
  const maxX = Math.max(100, ...drawn.map((b) => b.x + b.w + 5)) + pad, maxY = Math.max(50, ...drawn.map((b) => b.y + b.h)) + pad;
  const w = maxX - minX, h = maxY - minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pd-patch" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-size="${pd.fontSize || 10}">${parts.join('')}</svg>`;
}

export function render(pd, patchId = pd.rootPatchId, style = 'pd') {
  const { parts, drawn } = drawPatch(pd, patchId, {}, style);
  return svg(drawn, parts, pd);
}

const KINDS = new Set(['msg', 'text', 'floatatom', 'symbolatom', 'listbox', 'bng', 'tgl', 'hsl', 'vsl', 'hradio', 'vradio', 'nbx', 'vu', 'cnv']);
const kind = (n) => (KINDS.has(n.type) ? n.type : 'obj');
const tokens = (n) => [n.type, ...(n.args ?? [])];
const label = (n) => displayText(tokens(n));
const dist = (a, b) => Math.hypot(a.layout.x - b.layout.x, a.layout.y - b.layout.y);

function tokenSim(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
  }
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}

// node id -> [[dir, port, otherId, otherPort]]
function neighbours(p) {
  const m = {};
  for (const c of p?.connections ?? []) {
    (m[c.source.nodeId] ??= []).push(['o', c.source.portletId, c.sink.nodeId, c.sink.portletId]);
    (m[c.sink.nodeId] ??= []).push(['i', c.sink.portletId, c.source.nodeId, c.source.portletId]);
  }
  return m;
}

// Object matching after chsh2/pure-diff-viewer: unique-text anchors, propagate along cords, then best-score leftovers.
function matchNodes(op, np) {
  const O = Object.values(op?.nodes ?? {}), N = Object.values(np?.nodes ?? {});
  const oN = neighbours(op), nN = neighbours(np);
  const fwd = new Map(), back = new Map();
  const link = (nid, oid) => { fwd.set(nid, oid); back.set(oid, nid); };
  const sig = (p, nbs, id) => new Set((nbs[id] ?? []).map(([d, i, x, j]) => d + i + label(p.nodes[x]) + j));
  const nbSim = (n, o) => {
    const a = sig(np, nN, n.id), b = sig(op, oN, o.id);
    let k = 0;
    for (const x of a) k += b.has(x);
    return k / Math.max(a.size, b.size, 1);
  };

  const byLabel = (list) => {
    const m = new Map();
    for (const n of list) m.set(label(n), [...(m.get(label(n)) ?? []), n]);
    return m;
  };
  const oL = byLabel(O);
  for (const [k, ns] of byLabel(N)) if (ns.length === 1 && oL.get(k)?.length === 1) link(ns[0].id, oL.get(k)[0].id);

  const queue = [...fwd];
  while (queue.length) {
    const [nid, oid] = queue.pop();
    for (const [d, i, x, j] of nN[nid] ?? []) {
      if (fwd.has(x)) continue;
      const hit = (oN[oid] ?? []).find(([d2, i2, y, j2]) => d2 === d && i2 === i && j2 === j && !back.has(y) && label(op.nodes[y]) === label(np.nodes[x]));
      if (hit) { link(x, hit[2]); queue.push([x, hit[2]]); }
    }
  }

  // ponytail: greedy O(n*m) over leftovers, not min-cost assignment; fine for typical edits.
  const cand = [];
  for (const n of N) {
    if (fwd.has(n.id)) continue;
    for (const o of O) {
      if (back.has(o.id) || kind(n) !== kind(o)) continue;
      const tok = tokenSim(tokens(n), tokens(o)), d = dist(n, o);
      const score = tok + nbSim(n, o) + (d < 15 ? 1 : 15 / d);
      if (tok === 1 || score >= 1.2) cand.push([score, n.id, o.id]);
    }
  }
  for (const [, nid, oid] of cand.sort((a, b) => b[0] - a[0])) if (!fwd.has(nid) && !back.has(oid)) link(nid, oid);
  return back;
}

const cordKey = (c, map = (id) => id) => `${map(c.source.nodeId)}:${c.source.portletId}>${map(c.sink.nodeId)}:${c.sink.portletId}`;

// Map keyed by patch id (the new id, or the old id for subpatches only in the old version) ->
// {oldId, newId, nodes: Map(newNodeId -> class), removed: Set(oldNodeId), cords: Set(newCordIdx), removedCords: Set(oldCordIdx), changed}
// Patch ids are unique across parses, so the two versions' ids never collide.
export function diffPatches(oldPd, newPd, oldId = oldPd.rootPatchId, newId = newPd.rootPatchId, out = new Map()) {
  const op = oldPd.patches[oldId], np = newPd.patches[newId];
  const back = matchNodes(op, np);
  const fwd = new Map([...back].map(([o, n]) => [n, o]));
  const e = { oldId, newId, nodes: new Map(), removed: new Set(), cords: new Set(), removedCords: new Set(), changed: false };
  out.set(newId ?? oldId, e);

  for (const n of Object.values(np?.nodes ?? {})) {
    const o = op?.nodes[fwd.get(n.id)];
    let cls = !o ? 'pd-add' : label(n) !== label(o) ? 'pd-mod' : dist(n, o) ? 'pd-move' : '';
    if (n.nodeClass === 'subpatch') {
      diffPatches(oldPd, newPd, o?.nodeClass === 'subpatch' ? o.patchId : null, n.patchId, out);
      if (!cls && out.get(n.patchId).changed) cls = 'pd-mod';
    }
    if (cls) e.nodes.set(n.id, cls);
  }
  for (const o of Object.values(op?.nodes ?? {})) {
    if (back.has(o.id)) continue;
    e.removed.add(o.id);
    if (o.nodeClass === 'subpatch') diffPatches(oldPd, newPd, o.patchId, null, out);
  }
  const mapOld = (id) => back.get(id);
  const oldKeys = new Set((op?.connections ?? []).map((c) => cordKey(c, mapOld)));
  const newKeys = new Set((np?.connections ?? []).map((c) => cordKey(c)));
  np?.connections.forEach((c, i) => oldKeys.has(cordKey(c)) || e.cords.add(i));
  op?.connections.forEach((c, i) => newKeys.has(cordKey(c, mapOld)) || e.removedCords.add(i));
  e.changed = !!(e.nodes.size || e.removed.size || e.cords.size || e.removedCords.size);
  return out;
}

// Overlay: removed items from the old patch underneath, the new patch on top with changes marked.
export function renderDiff(oldPd, newPd, diff, key, style = 'pd') {
  const e = diff.get(key);
  const gone = e.newId === null;
  const none = { parts: [], drawn: [] };
  const a = e.oldId === null ? none : drawPatch(oldPd, e.oldId, {
    node: (id) => (gone || e.removed.has(id) ? 'pd-del' : null),
    cord: (i) => (gone || e.removedCords.has(i) ? 'pd-del' : null),
  }, style);
  const b = gone ? none : drawPatch(newPd, e.newId, {
    node: (id) => e.nodes.get(id) ?? '',
    cord: (i) => (e.cords.has(i) ? 'pd-add' : ''),
  }, style);
  return svg([...a.drawn, ...b.drawn], [...a.parts, ...b.parts], newPd);
}

// Breadcrumb helper: name of a subpatch for display.
export function patchName(pd, patchId) {
  for (const p of Object.values(pd.patches)) {
    for (const n of Object.values(p.nodes)) if (n.patchId === patchId) return displayText([n.type, ...n.args]);
  }
  return 'main';
}
