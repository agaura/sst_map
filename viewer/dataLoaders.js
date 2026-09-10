import { createFrameStore } from './frameData.js';
export async function loadTemperatureCube(url, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  const worker = new Worker(new URL('./data.worker.js', import.meta.url), { type: 'module' });
  let abort;
  try {
    const decoded = await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (data.progress) { onProgress?.(data.progress); return; }
        data.error ? reject(new Error(data.error)) : resolve(data.value);
      };
      worker.onerror = () => reject(new Error('Unable to decode the temperature archive. Reload to retry.'));
      worker.postMessage({ url: new URL(url, document.baseURI).href });
    });
    return createFrameStore(decoded);
  } finally {
    signal?.removeEventListener('abort', abort);
    // Release TIFF/network caches and the decoding worker after transfer.
    worker.terminate();
  }
}
