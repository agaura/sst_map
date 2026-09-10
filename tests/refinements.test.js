import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameStore } from '../viewer/frameData.js';
import { createNoStoreClient } from '../viewer/noStoreClient.js';
import { loadTemperatureCube } from '../viewer/dataLoaders.js';
import { graphLayout } from '../viewer/graphLayout.js';

test('plot boundaries align with timeline without stretching the SVG', () => {
  const rect = { width: 280, height: 180, left: 0, right: 280, top: 500, bottom: 680 };
  const layout = graphLayout(rect, { left: 300, top: 522, bottom: 660, height: 138 });
  assert.equal(layout.width, 280); assert.equal(layout.height, 180);
  assert.equal(rect.top + layout.margin.top, 522);
  assert.equal(rect.bottom - layout.margin.bottom, 660);
  const narrow = graphLayout({ width: 180, height: 50, right: 180, top: 500, bottom: 550 }, { left: 0, top: 570, bottom: 600, height: 30 });
  assert(narrow.margin.top + narrow.margin.bottom < narrow.height);
});

test('destroying the frame store releases its archive references', () => {
  const frames = [{ data: new Float32Array([22]), min: 22, max: 23 }];
  const cube = createFrameStore({ width: 1, height: 1, frames });
  assert.equal(cube.readFrame(0), frames[0]);
  cube.destroy(); cube.destroy();
  assert.equal(frames.length, 0); assert.equal(cube.readFrame(0), undefined);
  assert.deepEqual(cube.readPointSeries(0, 0), []);
});

test('TIFF byte-range requests explicitly bypass persistent HTTP caching', async () => {
  const original = globalThis.fetch;
  const signal = new AbortController().signal;
  let options;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, 'https://example.test/archive.tif'); options = opts;
    return new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'Content-Range': 'bytes 0-1/100' } });
  };
  try {
    const response = await createNoStoreClient('https://example.test/archive.tif').request({ headers: { Range: 'bytes=0-1' }, signal });
    assert.equal(options.cache, 'no-store'); assert.equal(options.signal, signal);
    assert.equal(options.headers.Range, 'bytes=0-1');
    assert(response.ok); assert.equal(response.status, 206);
    assert.equal(response.getHeader('Content-Range'), 'bytes 0-1/100');
    assert.deepEqual(new Uint8Array(await response.getData()), new Uint8Array([1, 2]));
  } finally { globalThis.fetch = original; }
});

test('leaving during archive decoding terminates the worker', async () => {
  const originalWorker = globalThis.Worker, originalDocument = globalThis.document;
  let worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage() {}
    terminate() { this.terminated = true; }
  };
  globalThis.document = { baseURI: 'http://localhost/main.html' };
  try {
    const lifetime = new AbortController();
    const loading = loadTemperatureCube('archive.tif', { signal: lifetime.signal });
    lifetime.abort();
    await assert.rejects(loading, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = originalWorker; globalThis.document = originalDocument; }
});

test('rectangular cloud canvases preserve equal horizontal and vertical scale', async () => {
  const { cloudProjectionBounds } = await import('../viewer/rendering.js');
  for (const [width, height] of [[300, 300], [280, 480], [235, 48], [134, 162]]) {
    const [halfWidth, halfHeight] = cloudProjectionBounds(width / height);
    const pixelsPerX = width / (2 * halfWidth), pixelsPerY = height / (2 * halfHeight);
    assert(Math.abs(pixelsPerX - pixelsPerY) < 1e-10);
    assert(halfWidth >= 1.08 && halfHeight >= 1.08);
  }
});
