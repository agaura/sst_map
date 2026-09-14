import { GeoTIFF } from '../vendor/geotiff.js';
import { createNoStoreSource } from './noStoreClient.js';
import { prepareFrame } from './frameData.js';
import { loadCompressedArchive } from './compressedData.js';
self.onmessage = async ({ data: { url } }) => {
  try {
    if (new URL(url).pathname.endsWith('.sstz')) {
      const { init, decompress } = await import('../vendor/zstd.js');
      const wasm = await fetch(new URL('../vendor/zstd.wasm', import.meta.url), { cache: 'no-store' });
      if (!wasm.ok) throw new Error('Unable to load Zstd decoder.');
      await init(await wasm.arrayBuffer());
      const value = await loadCompressedArchive(url, decompress, progress => self.postMessage({ progress }));
      self.postMessage({ value }, [...new Set(value.frames.map(frame => frame.data.buffer))]);
      return;
    }
    let lastReport = 0;
    const tiff = await GeoTIFF.fromSource(createNoStoreSource(url, progress => {
      const now = performance.now();
      if (now - lastReport < 100 && progress.received < progress.requested) return;
      lastReport = now;
      self.postMessage({ progress: { ...progress, stage: progress.received >= progress.requested ? 'Preparing field data' : 'Downloading field data' } });
    }), { cache: false });
    const count = await tiff.getImageCount();
    const first = await tiff.getImage();
    const noData = Number.parseFloat(first.getGDALNoData());
    let frames;
    if (count > 1) {
      frames = [];
      for (let index = 0; index < count; index++) {
        const page = await tiff.getImage(index);
        frames.push(prepareFrame(await page.readRasters({ samples: [0], interleave: true }), noData));
      }
    } else {
      const rasters = await first.readRasters({ interleave: false });
      frames = rasters.map(raster => prepareFrame(raster, noData));
    }
    const value = { width: first.getWidth(), height: first.getHeight(), frames };
    // One ownership transfer at startup, not a multi-megabyte copy every frame.
    self.postMessage({ value }, [...new Set(frames.map(frame => frame.data.buffer))]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
