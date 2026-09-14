export function prepareFrame(raster, noData) {
  const data = raster instanceof Float32Array ? raster : Float32Array.from(raster);
  let min = Infinity, max = -Infinity;
  for (let index = 0; index < data.length; index++) {
    const value = data[index];
    if ((Number.isFinite(noData) && value === noData) || Math.abs(value) <= 1e-6) {
      data[index] = NaN;
    } else if (Number.isFinite(value)) {
      min = Math.min(min, value); max = Math.max(max, value);
    }
  }
  return Number.isFinite(min) ? { data, min, max: max > min ? max : min + 1e-6 } : { data, min: 0, max: 1 };
}

// Deliberately synchronous. Scrubbing and point inspection must never wait for
// the network, a worker message, decompression, or another playback frame.
export function createFrameStore({ width, height, frames }) {
  let uploadData;
  return {
    width, height, frameCount: frames.length,
    // Reused data is borrowed until the next reusable read; GPU upload is synchronous.
    readFrame(index, { reuse = false } = {}) {
      const frame = frames[index];
      if (!(frame?.data instanceof Uint8Array)) return frame;
      if (reuse && uploadData?.length !== frame.data.length) uploadData = new Float32Array(frame.data.length);
      const data = reuse ? uploadData : new Float32Array(frame.data.length);
      for (let i = 0; i < data.length; i++) data[i] = decodeTemperature(frame.data[i]);
      return { ...frame, data };
    },
    readPointSeries(x, y) {
      x = Math.min(width - 1, Math.max(0, Math.round(x)));
      y = Math.min(height - 1, Math.max(0, Math.round(y)));
      const pixel = y * width + x;
      return frames.map((frame, index) => ({ index, value: frame.data instanceof Uint8Array ? decodeTemperature(frame.data[pixel]) : frame.data[pixel] }));
    },
    destroy() { frames.length = 0; uploadData = undefined; },
  };
}

function decodeTemperature(code) { return code === 0 ? NaN : -2 + (code - 1) * 38 / 254; }
