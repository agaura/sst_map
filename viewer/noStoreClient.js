// GeoTIFF's custom-client interface lets range reads bypass the browser's disk
// cache even when the dashboard is hosted by a different static server.
export function createNoStoreClient(url, onBytes) {
  return {
    async request({ headers, signal } = {}) {
      const response = await fetch(url, { headers, signal, cache: 'no-store' });
      return {
        ok: response.ok,
        status: response.status,
        getHeader: name => response.headers.get(name),
        cancel: () => response.body?.cancel(),
        async getData() {
          if (!onBytes || !response.body) return response.arrayBuffer();
          const reader = response.body.getReader();
          const chunks = [];
          let length = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            length += value.byteLength;
            onBytes(value.byteLength);
          }
          const buffer = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
          return buffer.buffer;
        },
      };
    },
  };
}

// GeoTIFF.fromSource requires raw buffers, not RemoteSource's range wrappers.
export function createNoStoreSource(url, onProgress) {
  const batchLimit = 16 * 1024 * 1024;
  const gapLimit = 64 * 1024;
  const queue = [];
  let pending = [], scheduled = false, active = 0, closed = false;
  let received = 0, requested = 0;
  const report = () => onProgress?.({ received, requested });
  const client = createNoStoreClient(url, onProgress ? bytes => { received += bytes; report(); } : undefined);
  async function download(batch) {
    const { offset, end, signal, jobs } = batch;
    try {
      signal?.throwIfAborted();
      const response = await client.request({ headers: { Range: `bytes=${offset}-${end - 1}` }, signal });
      if (response.status !== 206) {
        await response.cancel();
        throw new Error(`TIFF host must support byte ranges (received ${response.status}).`);
      }
      const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.getHeader('content-range') || '');
      if (!match || Number(match[1]) !== offset || Number(match[2]) >= end) {
        await response.cancel();
        throw new Error('Invalid TIFF range response.');
      }
      const buffer = await response.getData();
      if (buffer.byteLength !== Number(match[2]) - offset + 1) throw new Error('Truncated TIFF range response.');
      if (Number(match[2]) + 1 < end && (match[3] === '*' || Number(match[2]) + 1 !== Number(match[3]))) throw new Error('Incomplete TIFF range response.');
      for (const job of jobs) job.resolve(buffer.slice(job.offset - offset, job.offset - offset + job.length));
    } catch (error) {
      jobs.forEach(job => job.reject(error));
    }
  }
  function drain() {
    while (!closed && active < 2 && queue.length) {
      active++;
      download(queue.shift()).finally(() => { active--; drain(); });
    }
  }
  function flush() {
    scheduled = false;
    const jobs = pending.sort((a, b) => a.offset - b.offset);
    pending = [];
    let batch;
    for (const job of jobs) {
      const end = job.offset + job.length;
      if (!batch || batch.signal !== job.signal || job.offset > batch.end + gapLimit || Math.max(end, batch.end) - batch.offset > batchLimit) {
        batch = { offset: job.offset, end, signal: job.signal, jobs: [] };
        queue.push(batch);
        requested += job.length;
      } else {
        requested += Math.max(0, end - batch.end);
        batch.end = Math.max(end, batch.end);
      }
      batch.jobs.push(job);
    }
    report();
    drain();
  }
  return {
    async fetch(slices, signal) {
      if (closed) throw new Error('TIFF source is closed.');
      signal?.throwIfAborted();
      return Promise.all(slices.map(async ({ offset, length }) => {
        if (length > batchLimit) {
          const parts = [];
          for (let start = 0; start < length; start += batchLimit) parts.push({ offset: offset + start, length: Math.min(batchLimit, length - start) });
          const buffers = await this.fetch(parts, signal);
          const joined = new Uint8Array(buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0));
          let position = 0;
          for (const buffer of buffers) { joined.set(new Uint8Array(buffer), position); position += buffer.byteLength; }
          return joined.buffer;
        }
        return new Promise((resolve, reject) => {
        pending.push({ offset, length, signal, resolve, reject });
        if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
        });
      }));
    },
    async close() {
      closed = true;
      const error = new Error('TIFF source is closed.');
      pending.splice(0).forEach(job => job.reject(error));
      queue.splice(0).forEach(batch => batch.jobs.forEach(job => job.reject(error)));
    },
  };
}
