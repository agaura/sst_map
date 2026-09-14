import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCompressedArchive, reconstructCombined, validateArchiveHeader } from '../viewer/compressedData.js';
import { createFrameStore } from '../viewer/frameData.js';

const header = { version: 1, method: 'combined', codec: 'zstd-9', order: 'frame-row-column', min: -2, max: 36, noDataCode: 0, levels: 255, width: 2, height: 2, frames: 2, chunkFrames: 2 };
const expected = Uint8Array.of(0, 255, 1, 128, 4, 250, 0, 129);
const predicted = Uint8Array.of(0, 255, 1, 127, 4, 247, 255, 2);

test('combined prediction reconstructs rows and frames with modular arithmetic', () => {
  assert.deepEqual(reconstructCombined(predicted.slice(), 2, 2), expected);
});

test('archive rejects unsupported encodings and excessive allocations', () => {
  assert.throws(() => validateArchiveHeader(null));
  assert.throws(() => validateArchiveHeader({ ...header, max: 40 }));
  assert.throws(() => validateArchiveHeader({ ...header, width: 1e9 }));
});

test('streamed archive reconstructs shared chunk views and rejects truncation', async t => {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const archive = new Uint8Array(12 + json.length + 8 + predicted.length);
  archive.set(new TextEncoder().encode('SSTBEN01'));
  const view = new DataView(archive.buffer);
  view.setUint32(8, json.length, true);
  archive.set(json, 12);
  view.setUint32(12 + json.length, predicted.length, true);
  view.setUint32(16 + json.length, expected.length, true);
  archive.set(predicted, 20 + json.length);
  let bytes = archive;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.cache, 'no-store');
    return new Response(new ReadableStream({ start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
      c.close();
    } }));
  });
  const result = await loadCompressedArchive('test.sstz', data => data);
  assert.deepEqual(result.frames[0].data, expected.subarray(0, 4));
  assert.deepEqual(result.frames[1].data, expected.subarray(4));
  assert.equal(result.frames[0].data.buffer, result.frames[1].data.buffer);
  bytes = archive.subarray(0, archive.length - 1);
  await assert.rejects(loadCompressedArchive('test.sstz', data => data), /Incomplete/);
  bytes = new Uint8Array(archive.length + 1);
  bytes.set(archive);
  await assert.rejects(loadCompressedArchive('test.sstz', data => data), /trailing/);
});

test('remote archive requests enable HTTP caching with revalidation', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.cache, 'no-cache');
    return new Response(null, { status: 503 });
  });
  await assert.rejects(loadCompressedArchive('https://example.com/archive.sstz', data => data), /503/);
});

test('GPU reads reuse one upload buffer without mutating compact data', () => {
  const frames = [{ data: Uint8Array.of(1, 255) }, { data: Uint8Array.of(0, 128) }];
  const store = createFrameStore({ width: 2, height: 1, frames });
  const first = store.readFrame(0, { reuse: true });
  const second = store.readFrame(1, { reuse: true });
  assert.equal(first.data, second.data);
  assert.ok(Number.isNaN(second.data[0]));
  assert.equal(second.data[1], 17);
  assert.deepEqual(frames[0].data, Uint8Array.of(1, 255));
  assert.notEqual(store.readFrame(0).data, second.data);
  store.destroy();
  assert.equal(store.readFrame(0), undefined);
});

test('Uint8 frames and histories decode identical temperatures and missing values', () => {
  const store = createFrameStore({ width: 2, height: 2, frames: [{ data: expected.subarray(0, 4), min: -2, max: 36 }] });
  const data = store.readFrame(0).data;
  assert.ok(data instanceof Float32Array);
  assert.ok(Number.isNaN(data[0]));
  assert.equal(data[1], 36);
  assert.equal(data[2], -2);
  assert.equal(data[3], 17);
  assert.equal(store.readPointSeries(1, 1)[0].value, 17);
});
