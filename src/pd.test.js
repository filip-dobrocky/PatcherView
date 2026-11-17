import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch, render, fontSize } from './pd.js';

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
