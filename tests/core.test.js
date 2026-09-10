import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFrame, createFrameStore } from '../viewer/frameData.js';
import { fourierAmplitudes } from '../viewer/analysis.js';
import { TemperatureViewer } from '../viewer/controller.js';

test('frame preparation preserves land, no-data, range and float precision', () => {
  const raster = new Float32Array([-9999, 0, 1e-8, NaN, -2, 17.125, 36]);
  const frame = prepareFrame(raster, -9999);
  assert.equal(frame.data, raster);
  for (let i = 0; i < 4; i++) assert(Number.isNaN(frame.data[i]));
  assert.deepEqual(Array.from(frame.data.slice(4)), [-2, 17.125, 36]);
  assert.equal(frame.min, -2); assert.equal(frame.max, 36);
  assert.deepEqual(prepareFrame(new Float32Array([0]), NaN), { data: new Float32Array([NaN]), min: 0, max: 1 });
});

test('frames and histories are synchronous with no per-frame copies', () => {
  const frames = Array.from({ length: 365 }, (_, i) => prepareFrame(new Float32Array([i + 1, i + 2, i + 3, i + 4]), NaN));
  const cube = createFrameStore({ width: 2, height: 2, frames });
  for (let i = 364; i >= 0; i--) assert.equal(cube.readFrame(i), frames[i]);
  assert.equal(cube.readFrame(0).then, undefined);
  assert.deepEqual(cube.readPointSeries(1, 1), frames.map((f, index) => ({ index, value: index + 4 })));
  assert.deepEqual(cube.readPointSeries(-50, 99), cube.readPointSeries(0, 1));
});

function originalDFT(input) {
  const series = Array.from(input, value => ({ value }));
  const values = series.map(d => d.value).filter(Number.isFinite);
  if (!values.length) return [];
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const filled = series.map(d => Number.isFinite(d.value) ? d.value : mean), n = filled.length;
  return Array.from({ length: Math.floor(n / 2) + 1 }, (_, f) => {
    let real = 0, imaginary = 0;
    for (let i = 0; i < n; i++) {
      const angle = -2 * Math.PI * f * i / n;
      real += filled[i] * Math.cos(angle); imaginary += filled[i] * Math.sin(angle);
    }
    return Math.hypot(real, imaginary) * (f === 0 ? 1 / n : 2 / n);
  });
}
test('worker Fourier convention matches original for odd/even lengths and missing data', () => {
  for (const n of [0, 1, 2, 100, 365, 366]) {
    for (const data of [new Float32Array(n).fill(NaN), Float32Array.from({ length: n }, (_, i) => i % 13 ? 17 + 4 * Math.sin(i * .17) : NaN)]) {
      assert.deepEqual(Array.from(fourierAmplitudes(data)), originalDFT(data));
    }
  }
});

test('point histories are read afresh without caching', () => {
  let reads = 0;
  const viewer = { pointSeriesCache: new Map(), state: { cube: { readPointSeries: (x, y) => { reads++; return [{ index: 0, value: x + y }]; } } } };
  const get = (x, y = 0) => TemperatureViewer.prototype.getPointSeries.call(viewer, { x, y });
  const first = get(0); assert.notEqual(get(0), first); assert.equal(reads, 2);
  assert.equal(viewer.pointSeriesCache.size, 0);
});

test('frequency results are synchronous and reflect every input change', () => {
  const viewer = { fourierMode: true };
  const series = Array.from({ length: 8 }, (_, index) => ({ index, value: 2 }));
  const get = () => TemperatureViewer.prototype.graphDisplaySeries.call(viewer, series);
  const first = get();
  assert.equal(first[0].value, 2);
  series.forEach(datum => { datum.value = 5; });
  const second = get();
  assert.equal(second[0].value, 5);
  assert.notEqual(first, second);
  assert.equal(series.amplitudes, undefined);
});

test('scrubbing updates the display synchronously, including during playback', async () => {
  const frame = { data: new Float32Array([20]), min: 20, max: 21 };
  let uploads = 0;
  const viewer = {
    state: { initialized: true, isPlaying: true, pendingFrameRequestId: 0, frameCount: 365, width: 1, height: 1, cube: { readFrame: () => frame } },
    rendering: { setFrame: () => uploads++ }, updateLabels() {}, updateTimelineMarker() {}, updateCurrentGraphPoint() {},
  };
  const result = TemperatureViewer.prototype.setDisplayFrame.call(viewer, 271);
  assert.equal(viewer.state.displayFrameIndex, 271); assert.equal(uploads, 1);
  await result;
});

test('all seven WGSL sources remain byte-for-byte unchanged', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const source = await readFile(new URL('../viewer/rendering.js', import.meta.url), 'utf8');
  const shaders = [...source.matchAll(/(?:\/\* wgsl \*\/\s*|code:\s*)`([^`]+)`/g)].map(match => createHash('sha256').update(match[1]).digest('hex'));
  const expected = JSON.parse(await readFile(new URL('./shaders.sha256.json', import.meta.url), 'utf8'));
  assert.equal(shaders.length, 7); assert.deepEqual(shaders, expected);
});

test('point hover updates graph data synchronously while playing', async () => {
  const point = { x: 5, y: 6 }, series = [{ index: 0, value: 21.25 }];
  let draws = 0;
  const viewer = {
    state: { isPlaying: true, hoverPoint: point }, hoverSeriesRequestId: 0,
    getPointSeries: () => series, renderGraphSeries: () => draws++,
    updateCurrentGraphPoint() {}, updateTemperatureGraphVisibility() {},
  };
  const result = TemperatureViewer.prototype.updateHoverSeries.call(viewer, point);
  assert.equal(viewer.hoverSeries, series); assert.equal(draws, 1);
  await result;
});

test('frequency work coalesces pointer moves and preserves pin requests', async () => {
  const { AnalysisClient } = await import('../viewer/analysisClient.js');
  const oldWorker = globalThis.Worker;
  let fake;
  globalThis.Worker = class {
    constructor() { fake = this; this.sent = []; }
    postMessage(message) { this.sent.push(message); }
    finish() { const job = this.sent.at(-1); this.onmessage({ data: { id: job.id, amplitudes: new Float64Array([12]) } }); }
    terminate() {}
  };
  try {
    const client = new AnalysisClient();
    const active = client.analyze(new Float32Array([1]), 'hover');
    const superseded = client.analyze(new Float32Array([2]), 'hover');
    const latest = client.analyze(new Float32Array([3]), 'hover');
    const pin = client.analyze(new Float32Array([4]), 'pinned');
    assert.equal(await superseded, null); assert.equal(fake.sent.length, 1);
    fake.finish(); await active; assert.equal(fake.sent[1].values[0], 4);
    fake.finish(); await pin; assert.equal(fake.sent[2].values[0], 3);
    fake.finish(); await latest; assert.equal(client.queued.size, 0);
    client.destroy();
  } finally { globalThis.Worker = oldWorker; }
});
