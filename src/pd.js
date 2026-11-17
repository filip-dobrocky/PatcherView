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

function wrap(text, maxChars) {
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
  if (n.nodeClass === 'subpatch') {
    const sub = pd.patches[n.patchId];
    return sub.nodes[sub.outlets[outlet]]?.type === 'outlet~';
  }
  return n.type.endsWith('~') && !CONTROL_OUT.has(n.type) || n.type === 'adc~';
}

// Only plain #rrggbb colors pass; old-style numeric Pd colors fall back to the theme.
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
const attr = (name, v) => (v ? ` ${name}="${v}"` : '');

function drawText(b, lines, [, lh]) {
  return lines.map((l, i) => `<text x="${b.x + LMARGIN}" y="${b.y + TMARGIN + lh * i + lh * 0.75}">${esc(l)}</text>`).join('');
}

function drawLabel(n, b) {
  const L = n.layout;
  if (blank(L.label)) return '';
  return `<text x="${b.x + (L.labelX ?? 0)}" y="${b.y + (L.labelY ?? 0)}" font-size="${+L.labelFontSize || 10}" dominant-baseline="middle"${attr('fill', color(L.labelColor))}>${esc(unescape(L.label))}</text>`;
}

function drawNode(pd, n, b, metrics) {
  const { x, y, w, h } = b;
  const R = (cls) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}"${cls === 'pd-iem' ? attr('fill', color(n.layout.bgColor)) : ''}/>`;
  const fg = attr('stroke', color(n.layout.fgColor));
  switch (b.shape) {
    case 'text': return `<g class="pd-comment">${drawText(b, b.lines, metrics)}</g>`;
    case 'msg': {
      const c = Math.min(4, h / 4);
      return `<polygon class="pd-box" points="${x},${y} ${x + w + c},${y} ${x + w},${y + c} ${x + w},${y + h - c} ${x + w + c},${y + h} ${x},${y + h}"/>${drawText(b, b.lines, metrics)}`;
    }
    case 'atom': {
      const c = 4;
      return `<polygon class="pd-box" points="${x},${y} ${x + w - c},${y} ${x + w},${y + c} ${x + w},${y + h} ${x},${y + h}"/>${drawText(b, b.lines, metrics)}${drawLabel(n, b)}`;
    }
    case 'box': {
      const sub = n.nodeClass === 'subpatch' ? ` data-patch="${esc(n.patchId)}"` : '';
      return `<g class="pd-obj${sub ? ' pd-sub' : ''}"${sub}>${R('pd-box')}${drawText(b, b.lines, metrics)}</g>`;
    }
    case 'gop': {
      const plots = b.arrays.map((a) => plotArray(a, b)).join('');
      return `<g class="pd-sub" data-patch="${esc(n.patchId)}">${R('pd-box')}${plots}${b.label ? `<text x="${x + 2}" y="${y - 3}">${esc(b.label)}</text>` : ''}</g>`;
    }
    case 'bng': return `${R('pd-iem')}<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 1}" class="pd-line"${fg}/>${drawLabel(n, b)}`;
    case 'tgl': return `${R('pd-iem')}${drawLabel(n, b)}`;
    case 'hsl': return `${R('pd-iem')}<line x1="${x + 1}" y1="${y}" x2="${x + 1}" y2="${y + h}" class="pd-line" stroke-width="3"${fg}/>${drawLabel(n, b)}`;
    case 'vsl': return `${R('pd-iem')}<line x1="${x}" y1="${y + h - 1}" x2="${x + w}" y2="${y + h - 1}" class="pd-line" stroke-width="3"${fg}/>${drawLabel(n, b)}`;
    case 'hradio': case 'vradio': {
      const s = n.layout.size, cells = [];
      for (let i = 1; i < n.args[0]; i++) cells.push(b.shape === 'hradio' ? `<line x1="${x + i * s}" y1="${y}" x2="${x + i * s}" y2="${y + h}" class="pd-line"/>` : `<line x1="${x}" y1="${y + i * s}" x2="${x + w}" y2="${y + i * s}" class="pd-line"/>`);
      return `${R('pd-iem')}${cells.join('')}${drawLabel(n, b)}`;
    }
    case 'nbx': {
      const t = h / 2;
      return `${R('pd-iem')}<polyline points="${x},${y} ${x + t},${y + t} ${x},${y + h}" class="pd-line"${fg}/><text x="${x + t + 2}" y="${y + h * 0.75}">0</text>${drawLabel(n, b)}`;
    }
    case 'vu': return `${R('pd-iem')}${drawLabel(n, b)}`;
    case 'cnv': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color(n.layout.bgColor) || '#e0e0e0'}"/>${drawLabel(n, b)}`;
  }
  return '';
}

// ponytail: y range assumed -1..1 (the parser drops #X coords ranges)
function plotArray(a, b) {
  if (!a.data?.length) return '';
  const n = a.data.length, pts = a.data.map((v, i) => `${b.x + (b.w * i) / Math.max(n - 1, 1)},${b.y + (b.h * (1 - Math.max(-1, Math.min(1, v)))) / 2}`);
  return `<polyline points="${pts.join(' ')}" class="pd-line"/>`;
}

export function render(pd, patchId = pd.rootPatchId) {
  const patch = pd.patches[patchId];
  const metrics = FONTS[pd.fontSize || 10];
  const boxes = {};
  for (const n of Object.values(patch.nodes)) {
    if (n.nodeClass === 'array') continue;
    boxes[n.id] = layoutNode(pd, patch, n, metrics);
  }
  for (const c of patch.connections) {
    const s = boxes[c.source.nodeId], t = boxes[c.sink.nodeId];
    if (s) s.outlets = Math.max(s.outlets, c.source.portletId + 1);
    if (t) t.inlets = Math.max(t.inlets, c.sink.portletId + 1);
  }

  const parts = [];
  // canvases go underneath everything else, like in Pd
  const ordered = Object.values(patch.nodes).filter((n) => boxes[n.id]).sort((a, b) => (b.type === 'cnv') - (a.type === 'cnv'));
  for (const n of ordered) {
    const b = boxes[n.id];
    parts.push(drawNode(pd, n, b, metrics));
    for (let i = 0; i < b.inlets; i++) parts.push(`<rect class="pd-io" x="${ioX(b, i, b.inlets)}" y="${b.y}" width="${IOWIDTH}" height="${IOHEIGHT}"/>`);
    for (let i = 0; i < b.outlets; i++) parts.push(`<rect class="pd-io" x="${ioX(b, i, b.outlets)}" y="${b.y + b.h - IOHEIGHT + 1}" width="${IOWIDTH}" height="${IOHEIGHT - 1}"/>`);
  }
  for (const c of patch.connections) {
    const s = boxes[c.source.nodeId], t = boxes[c.sink.nodeId];
    if (!s || !t) continue;
    const sig = isSignalOut(pd, patch.nodes[c.source.nodeId], c.source.portletId);
    const x1 = ioX(s, c.source.portletId, s.outlets) + IOWIDTH / 2, y1 = s.y + s.h;
    const x2 = ioX(t, c.sink.portletId, t.inlets) + IOWIDTH / 2, y2 = t.y;
    parts.push(`<line class="pd-cord${sig ? ' pd-sig' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }

  const all = Object.values(boxes);
  const pad = 10;
  const minX = Math.min(0, ...all.map((b) => b.x)) - pad, minY = Math.min(0, ...all.map((b) => b.y - (b.shape === 'gop' ? 15 : 0))) - pad;
  const maxX = Math.max(100, ...all.map((b) => b.x + b.w + 5)) + pad, maxY = Math.max(50, ...all.map((b) => b.y + b.h)) + pad;
  const w = maxX - minX, h = maxY - minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pd-patch" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-size="${pd.fontSize || 10}">${parts.join('')}</svg>`;
}

// Breadcrumb helper: name of a subpatch for display.
export function patchName(pd, patchId) {
  for (const p of Object.values(pd.patches)) {
    for (const n of Object.values(p.nodes)) if (n.patchId === patchId) return displayText([n.type, ...n.args]);
  }
  return 'main';
}
