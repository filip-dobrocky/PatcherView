import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaxPatch } from './max.js';
import { render, diffPatches, renderDiff, patchName } from './pd.js';

const box = (id, maxclass, text, rect, ins, outs, outlettype = [], extra = {}) =>
  ({ box: { id, maxclass, text, patching_rect: rect, numinlets: ins, numoutlets: outs, outlettype, ...extra } });
const line = (s, so, d, di) => ({ patchline: { source: [s, so], destination: [d, di] } });
const patcher = (boxes, lines) => ({ patcher: { boxes, lines } });

const SUB = patcher([box('obj-1', 'inlet', undefined, [10, 10, 30, 30], 0, 1, [''])], []);
const MAX = patcher([
  box('obj-1', 'newobj', 'cycle~ 440', [30, 30, 70, 22], 2, 1, ['signal']),
  box('obj-2', 'ezdac~', undefined, [30, 100, 45, 45], 2, 0),
  box('obj-3', 'message', 'set "a \\"}\\" b"', [150, 30, 80, 22], 2, 1, ['']),
  box('obj-4', 'comment', 'hello', [150, 100, 80, 20], 1, 0),
  box('obj-5', 'newobj', 'p sub', [250, 30, 50, 22], 1, 0, [], { patcher: SUB.patcher }),
], [line('obj-1', 0, 'obj-2', 0), line('obj-1', 0, 'obj-2', 1), line('obj-3', 0, 'obj-5', 0)]);

test('render a Max patch', () => {
  const pd = parseMaxPatch(JSON.stringify(MAX));
  const svg = render(pd);
  assert.equal(svg.match(/class="pd-cord/g).length, 3);
  assert.equal(svg.match(/pd-sig/g).length, 2, 'cycle~ outlet is signal');
  assert.match(svg, />cycle~ 440</);
  assert.match(svg, />hello</);
  // cycle~ 2+1, ezdac~ 2, msg 2+1, comment 0, p sub 1
  assert.equal(svg.match(/class="pd-io"/g).length, 3 + 2 + 3 + 0 + 1);
  const sub = pd.patches[pd.rootPatchId].nodes['obj-5'].patchId;
  assert.match(svg, new RegExp(`data-patch="${sub}"`));
  assert.equal(patchName(pd, sub), 'p sub');
  assert.match(render(pd, sub), /class="pd-io"/);
});

test('amxd: JSON inside binary chunks, frozen data after it', () => {
  const amxd = 'ampf\x04\0\0\0aaaameta\x04\0\0\0{\0\0\0ptch\x7b\0\0\0' + JSON.stringify(MAX) + '\0dlst{garbage';
  const pd = parseMaxPatch(amxd);
  assert.equal(Object.keys(pd.patches[pd.rootPatchId].nodes).length, 5);
});

test('diff Max patches', () => {
  const next = structuredClone(MAX);
  next.patcher.boxes[0].box.text = 'cycle~ 220';
  next.patcher.boxes.push(box('obj-9', 'newobj', 'gain~', [30, 60, 40, 22], 2, 2, ['signal', '']));
  next.patcher.boxes[4].box.patcher.boxes[0].box.patching_rect = [20, 20, 30, 30];
  const o = parseMaxPatch(JSON.stringify(MAX)), n = parseMaxPatch(JSON.stringify(next));
  const e = diffPatches(o, n).get(n.rootPatchId);
  assert.equal(e.nodes.get('obj-1'), 'pd-mod');
  assert.equal(e.nodes.get('obj-9'), 'pd-add');
  assert.equal(e.nodes.get('obj-5'), 'pd-mod', 'changed subpatcher marks its box');
  assert.match(renderDiff(o, n, diffPatches(o, n), n.rootPatchId), /pd-add/);
  assert.equal(diffPatches(parseMaxPatch('{"patcher":{}}'), n).get(n.rootPatchId).nodes.size, 6);
});

test('interface objects, cord midpoints and the Max drawing style', () => {
  const pd = parseMaxPatch(JSON.stringify(patcher([
    box('d', 'dial', undefined, [10, 10, 40, 40], 1, 1, [''], { bgcolor: [1, 0, 0, 1] }),
    box('k', 'kslider', undefined, [10, 60, 84, 30], 2, 2, ['', ''], { range: 12, offset: 60 }),
    box('t', 'toggle', undefined, [100, 10, 20, 20], 1, 1, ['int']),
    box('m', 'message', 'bang', [100, 60, 40, 22], 2, 1, [''], { bgcolor: [0, 0, 1, 1] }),
  ], [{ patchline: { source: ['d', 0], destination: ['t', 0], midpoints: [60, 30, 60, 5] } }])));
  const pdStyle = render(pd), maxStyle = render(pd, pd.rootPatchId, 'max');
  assert.match(pdStyle, /<path d="M[^"]*A/, 'dial arc');
  assert.equal(pdStyle.match(/pd-black/g).length, 5, 'one octave of black keys');
  assert.match(pdStyle, /points="[\d.]+ [\d.]+ 60 30 60 5 /, 'cord goes through its midpoints');
  assert.doesNotMatch(pdStyle, /rgba\(/, 'box colours only in Max style');
  assert.match(maxStyle, /fill="rgba\(255,0,0,1\)"/);
  assert.match(maxStyle, /<polyline class="pd-cord" points="[\d.]+ [\d.]+ 60 30 60 5 /, 'segmented cord stays segmented in Max view');
  assert.match(render(parseMaxPatch(JSON.stringify(MAX)), undefined, 'max'), /<path class="pd-cord pd-sig" d="M[\d.,]+C/, 'other cords curve');
  assert.match(maxStyle, /class="pd-box pd-msg" rx="3" fill="rgba\(0,0,255,1\)"/);
});

test('Pd default iemgui colours give way to the theme in Max style', async () => {
  const { parsePatch } = await import('./pd.js');
  const pd = parsePatch('#N canvas 0 50 450 300 10;\n#X obj 10 10 tgl 15 0 empty empty empty 17 7 0 10 #fcfcfc #000000 #000000 0 1;\n');
  assert.match(render(pd), /fill="#fcfcfc"/);
  assert.doesNotMatch(render(pd, pd.rootPatchId, 'max'), /#fcfcfc|#000000/);
});
