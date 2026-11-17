import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch, render, fontSize, diffPatches, renderDiff } from './pd.js';
import { diffFiles } from './udiff.js';

const PATCH = String.raw`#N canvas 0 50 450 300 12;
#X obj 30 30 osc~ 440;
#X obj 30 80 dac~;
#X msg 120 30 \; pd dsp 1, f 20;
#X text 200 80 hello \, world;
#N canvas 0 50 450 300 sub 0;
#X obj 10 10 inlet~;
#X obj 10 60 outlet;
#X obj 10 30 outlet~;
#X connect 0 0 2 0;
#X restore 30 130 pd sub;
#X connect 0 0 1 0;
#X connect 0 0 1 1;
#X connect 4 1 1 0;
`;

test('font size from canvas header', () => {
  assert.equal(fontSize(PATCH), 12);
  assert.equal(fontSize('#N canvas 0 0 10 10 7;'), 10);
});

test('render root patch', () => {
  const svg = render(parsePatch(PATCH));
  assert.equal(svg.match(/class="pd-cord/g).length, 3);
  assert.equal(svg.match(/pd-sig/g).length, 3, 'osc~ cords and outlet~ cord are signal');
  assert.match(svg, />;<\/text><text[^>]*>pd dsp 1</, 'message ; breaks the line');
  assert.match(svg, />hello, world</);
  assert.match(svg, /data-patch="1"/);
  // dac~ shows 2 inlets, osc~ 2 inlets + 1 outlet, sub 1 inlet + 2 outlets, msg 1+1
  assert.equal(svg.match(/class="pd-io"/g).length, 2 + 3 + 3 + 2);
});

test('render subpatch with connection indices local to it', () => {
  const pd = parsePatch(PATCH);
  const sub = Object.keys(pd.patches).find((k) => k != pd.rootPatchId); // ids are global across parses
  const svg = render(pd, sub);
  assert.equal(svg.match(/class="pd-cord pd-sig"/g).length, 1);
});

test('diff: deleting an object renumbers connects but only its own cords change', () => {
  const OLD = String.raw`#N canvas 0 50 450 300 10;
#X obj 30 10 loadbang;
#X obj 30 30 osc~ 440;
#X obj 130 30 noise~;
#X obj 30 80 *~ 0.1;
#X obj 30 120 dac~;
#X obj 200 10 print a;
#X connect 1 0 3 0;
#X connect 2 0 3 0;
#X connect 3 0 4 0;
#X connect 3 0 4 1;
`;
  // noise~ removed, *~ edited, print moved, a msg added
  const NEW = String.raw`#N canvas 0 50 450 300 10;
#X obj 30 10 loadbang;
#X obj 30 30 osc~ 440;
#X obj 30 80 *~ 0.2;
#X obj 30 120 dac~;
#X obj 250 10 print a;
#X msg 100 10 hi;
#X connect 1 0 2 0;
#X connect 2 0 3 0;
#X connect 2 0 3 1;
#X connect 5 0 4 0;
`;
  const o = parsePatch(OLD), n = parsePatch(NEW);
  const d = diffPatches(o, n);
  const e = d.get(n.rootPatchId);
  assert.deepEqual([...e.nodes], [['2', 'pd-mod'], ['4', 'pd-move'], ['5', 'pd-add']]);
  assert.deepEqual([...e.removed], ['2']);
  assert.deepEqual([...e.cords], [3]);
  assert.deepEqual([...e.removedCords], [1]);
  const svg = renderDiff(o, n, d, n.rootPatchId);
  assert.equal(svg.match(/<g class="pd-del">/g).length, 1);
  assert.equal(svg.match(/class="pd-cord[^"]*pd-del/g).length, 1);
  assert.equal(svg.match(/class="pd-cord/g).length, 5);
});

test('diff: subpatch changes mark the parent box, removed subpatch is browsable', () => {
  const sub = (body) => `#N canvas 0 50 450 300 10;\n#N canvas 0 0 100 100 inner 0;\n${body}#X restore 10 10 pd inner;\n#N canvas 0 0 100 100 gone 0;\n#X obj 1 1 print;\n#X restore 10 60 pd gone;\n`;
  const o = parsePatch(sub('#X obj 1 1 inlet;\n'));
  const n = parsePatch('#N canvas 0 50 450 300 10;\n#N canvas 0 0 100 100 inner 0;\n#X obj 1 1 inlet;\n#X obj 1 40 outlet;\n#X restore 10 10 pd inner;\n');
  const d = diffPatches(o, n);
  assert.equal(d.get(n.rootPatchId).nodes.get('0'), 'pd-mod');
  const gone = [...d.values()].find((e) => e.newId === null && e.oldId !== o.rootPatchId);
  assert.match(renderDiff(o, n, d, gone.oldId), /<g class="pd-del">/);
});

test('changed files of a unified diff', () => {
  const diff = `diff --git a/x.pd b/x.pd
index 1..2 100644
--- a/x.pd
+++ b/x.pd
@@ -1,3 +1,3 @@
 a
-b
+B
 c
diff --git a/old.pd b/old.pd
deleted file mode 100644
--- a/old.pd
+++ /dev/null
@@ -1,2 +0,0 @@
-p
---- q
diff --git a/r.pd b/s.pd
similarity index 100%
rename from r.pd
rename to s.pd
diff --git a/new.pd b/new.pd
new file mode 100644
--- /dev/null
+++ b/new.pd
@@ -0,0 +1 @@
+x
`;
  assert.deepEqual(diffFiles(diff), [
    { oldPath: 'x.pd', newPath: 'x.pd' },
    { oldPath: 'old.pd', newPath: null },
    { oldPath: 'r.pd', newPath: 's.pd' },
    { oldPath: null, newPath: 'new.pd' },
  ]);
});
