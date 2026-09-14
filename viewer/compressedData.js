export function validateArchiveHeader(h) {
  if (!h || typeof h !== 'object') throw new Error('Invalid SST archive header.');
  if (h.version !== 1 || h.method !== 'combined' || h.codec !== 'zstd-9' || h.order !== 'frame-row-column' || h.min !== -2 || h.max !== 36 || h.noDataCode !== 0 || h.levels !== 255) throw new Error('Unsupported SST archive format.');
  for (const key of ['width', 'height', 'frames', 'chunkFrames']) {
    if (!Number.isSafeInteger(h[key]) || h[key] <= 0) throw new Error('Invalid SST archive dimensions.');
  }
  if (h.width * h.height * h.frames > 512 * 1024 * 1024 || h.width * h.height * h.chunkFrames > 32 * 1024 * 1024) throw new Error('SST archive exceeds supported memory limits.');
  return h;
}

export function reconstructCombined(data, width, height) {
  const pixels = width * height;
  for (let i = 0; i < data.length; i++) {
    const left = i % width ? data[i - 1] : 0;
    const previous = i >= pixels ? data[i - pixels] : 0;
    const previousLeft = i >= pixels && i % width ? data[i - pixels - 1] : 0;
    data[i] = data[i] + left + previous - previousLeft;
  }
  return data;
}

export async function loadCompressedArchive(url, decompress, onProgress) {
  // HTTP caching stores only the compressed response, without cloning its stream.
  // Revalidate remote files so replacing an archive at the same URL is safe.
  const remote = new URL(url, globalThis.location?.href || 'http://localhost/').origin !== (globalThis.location?.origin || 'http://localhost');
  const response = await fetch(url, { cache: remote ? 'no-cache' : 'no-store' });
  if (!response.ok || !response.body) throw new Error(`Unable to download SST archive (${response.status}).`);
  const requested = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  let buffer = new Uint8Array(0), position = 0, received = 0, lastReport = 0;
  async function read(length) {
    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (position === buffer.length) {
        const next = await reader.read();
        if (next.done) throw new Error('Incomplete SST archive download.');
        buffer = next.value; position = 0; received += buffer.length;
        if (performance.now() - lastReport >= 100 || received === requested) {
          lastReport = performance.now();
          onProgress?.({ received, requested, stage: 'Downloading field data' });
        }
      }
      const count = Math.min(length - written, buffer.length - position);
      result.set(buffer.subarray(position, position + count), written);
      position += count; written += count;
    }
    return result;
  }
  try {
    const prefix = await read(12);
    if (new TextDecoder().decode(prefix.subarray(0, 8)) !== 'SSTBEN01') throw new Error('Invalid SST archive signature.');
    const headerLength = new DataView(prefix.buffer).getUint32(8, true);
    if (headerLength > 65536) throw new Error('Invalid SST archive header size.');
    const h = validateArchiveHeader(JSON.parse(new TextDecoder().decode(await read(headerLength))));
    const frames = [], pixels = h.width * h.height;
    while (frames.length < h.frames) {
      const lengths = new DataView((await read(8)).buffer);
      const compressedLength = lengths.getUint32(0, true), decodedLength = lengths.getUint32(4, true);
      const count = Math.min(h.chunkFrames, h.frames - frames.length);
      if (!compressedLength || compressedLength > 64 * 1024 * 1024 || decodedLength !== count * pixels) throw new Error('Invalid SST chunk lengths.');
      const compressed = await read(compressedLength);
      onProgress?.({ received, requested, stage: 'Preparing field data' });
      const data = await decompress(compressed);
      if (data.length !== decodedLength) throw new Error('Invalid decoded SST chunk size.');
      reconstructCombined(data, h.width, h.height);
      for (let i = 0; i < count; i++) frames.push({ data: data.subarray(i * pixels, (i + 1) * pixels), min: -2, max: 36 });
    }
    // Consume EOF rather than canceling a possibly unfinished HTTP cache write.
    if (position !== buffer.length || !(await reader.read()).done) throw new Error('Unexpected trailing SST archive data.');
    return { width: h.width, height: h.height, frames };
  } finally { await reader.cancel(); }
}
