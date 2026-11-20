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
