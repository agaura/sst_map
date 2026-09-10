import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoStoreSource } from '../viewer/noStoreClient.js';

test('batch downloads respect size and concurrency limits', async () => {
  const originalFetch = globalThis.fetch;
  let active = 0, peak = 0;
  const sizes = [];
  globalThis.fetch = async (_url, options) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range).map(Number);
    sizes.push(end - start + 1);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return new Response(new Uint8Array(end - start + 1), {
      status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/100000000` },
    });
  };
  try {
    const source = createNoStoreSource('https://example.test/data.tif');
    const result = await source.fetch(Array.from({ length: 5 }, (_, i) => ({ offset: i * 8 * 1048576, length: 8 * 1048576 })));
    assert.equal(result.length, 5);
    assert.equal(sizes.length, 3);
    assert(sizes.every(size => size <= 16 * 1048576));
    assert.equal(peak, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('concurrent nearby ranges share a request and preserve caller order', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.headers.Range);
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range).map(Number);
    return new Response(Uint8Array.from({ length: end - start + 1 }, (_, i) => start + i), {
      status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/100` },
    });
  };
  try {
    const source = createNoStoreSource('https://example.test/data.tif');
    const [first, second] = await Promise.all([
      source.fetch([{ offset: 10, length: 3 }, { offset: 2, length: 2 }]),
      source.fetch([{ offset: 4, length: 4 }]),
    ]);
    assert.deepEqual(calls, ['bytes=2-12']);
    assert.deepEqual(first.map(buffer => [...new Uint8Array(buffer)]), [[10, 11, 12], [2, 3]]);
    assert.deepEqual([...new Uint8Array(second[0])], [4, 5, 6, 7]);
    await source.fetch([{ offset: 4, length: 4 }]);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('uncached TIFF source returns raw buffers and repeats network reads', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    return new Response(new Uint8Array([3, 4, 5]), {
      status: 206, headers: { 'Content-Range': 'bytes 2-4/10' },
    });
  };
  try {
    const source = createNoStoreSource('https://example.test/data.tif');
    for (let i = 0; i < 2; i++) {
      const [buffer] = await source.fetch([{ offset: 2, length: 3 }]);
      assert.equal(new DataView(buffer).getUint8(0), 3);
      assert.deepEqual([...new Uint8Array(buffer)], [3, 4, 5]);
    }
    assert.equal(calls.length, 2);
    assert(calls.every(call => call.cache === 'no-store' && call.headers.Range === 'bytes=2-4'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
