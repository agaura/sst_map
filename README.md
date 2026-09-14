# Sea Surface Thermal Observatory

An interactive WebGPU map of daily sea-surface temperatures for 2019. Explore a flat map or globe, inspect temperature histories and frequency spectra, and adjust palette hue, edge contrast, and HDR highlights. HDR is optional; WebGPU and a secure connection are required.

Run with Node.js 20 or newer:

```sh
npm start
```

Open **http://localhost:8768/main.html**. A WebGPU-capable browser and localhost or HTTPS are required. The dataset loads from https://pub-68cd895ae8ad4a04ae416191b982c1eb.r2.dev/mur_sst_cube_global.sstz; no local dataset is required. Add your preview origin (for example, `http://localhost:8768`, without a trailing slash) to the R2 CORS allowed origins. Production uses `https://agaura.github.io`.

For local data, `config.local.json` can contain `{ "preferLocalDataset": true }` (see `config.local.example.json`). The app then checks for `mur_sst_cube_global.sstz` beside `main.html` and uses it when present; otherwise it uses R2. The local configuration, compressed archive, and original TIFF are ignored by Git. This JSON file is browser-readable configuration, not a place for secrets.

Production uses the compressed R2 archive configured by `REMOTE_COMPRESSED_DATASET` in `viewer/datasetConfig.js`. Keep the `.sstz` URL extension so the worker selects the compressed decoder. Clearing that setting explicitly restores the legacy TIFF source; failed compressed downloads do not automatically download the much larger TIFF.

Runtime libraries are included in `vendor/`. The dataset loads from R2 unless local mode is enabled. Google Analytics loads externally from Google, using measurement ID `G-BBWS173BMQ` in `main.html`. To rebuild the libraries from the pinned dependencies:

```sh
npm ci
npm run build
npm test
```

The compressed archive is 55.07 MiB and retains about 253 MiB of Uint8 frame data. A worker streams one download and decodes independent 16-frame chunks with Zstandard, then reverses spatial and temporal prediction. Code zero marks missing data; codes 1 through 255 represent -2 through 36 degrees Celsius (approximately 0.150 degrees per step). These values match the palette bounds. Compression is lossless relative to that quantization, not the original Float32 data.

The worker transfers its frame buffers once, without copying them to the main thread. Scrubbing expands only the selected frame into one reusable Float32 upload buffer (about 2.77 MiB); point histories decode values directly from Uint8. Chunk prediction is reversed in place and frames share views into those chunks. Edge contrast and emphasis therefore use the same quantized temperatures. Neither interaction requires further downloads or Zstandard decompression. Frequency analysis runs synchronously on demand. Point histories and Fourier results are not cached.

The `.sstz` container uses the `SSTBEN01` signature, a little-endian Uint32 JSON-header length, the UTF-8 header, and chunks prefixed by little-endian Uint32 compressed and decoded lengths. The header specifies dimensions, frame count, chunk size, prediction, codec, and temperature encoding. Zstandard JavaScript and WebAssembly are bundled in `vendor/` by `npm run build`.

On desktop, hover over the flat map to inspect a history and click to pin a location. Hover over the timeline to preview a frame; click to select it. Use the arrow keys on the timeline, or comma/period, to step frames. Drag the color cloud or the sphere to rotate it.

On touchscreens, tap the flat map to pin a location and swipe vertically to scroll the page. Drag the timeline to select a frame and pause playback. The pinned location's coordinates and current temperature appear beneath the timeline. Playback controls and numeric inputs have larger touch targets. Reduced-motion preferences disable initial color-cloud auto-rotation; its checkbox can override that choice.

The remote compressed archive uses the browser's HTTP cache. Reloads revalidate it using R2's ETag; an unchanged cached archive avoids another full download and is decompressed again in a worker. Only the compressed response is stored persistently, not the decoded frames. Storage is browser-managed and may be evicted or disabled; this is not an offline guarantee. Do not set `Cache-Control: no-store` on the R2 archive. A small validation request still occurs on reload. Progress counts bytes read from either the network or cache, not necessarily network traffic.

Local archives and the legacy TIFF path remain uncached. The TIFF fallback downloads approximately 1.06 GB and retains roughly another gigabyte of decoded frames. Both loaders display received bytes, elapsed time, and preparation status. Actual peak memory also includes decoder WebAssembly memory, compressed chunk staging, browser networking/cache buffers, GPU allocations, and garbage-collection overhead; 253 MiB is the retained dataset size, not a total-memory limit. The compressed stream is neither cloned nor collected into a full-file JavaScript buffer.

For GitHub Pages, publish the HTML, CSS, JavaScript, `viewer/`, and `vendor/` with their relative paths intact, including `vendor/zstd.wasm`. The local dataset and configuration are not required. R2 must allow the deployed origin and GET requests; expose `Content-Length` for download progress. The legacy TIFF loader additionally needs range requests and exposed `Content-Range`. For iPhone testing, use the deployed HTTPS URL: a plain HTTP LAN address is not a secure context for WebGPU.

The viewer retains the loaded dataset as working data and releases workers, frame references, and GPU resources when you leave. GeoTIFF download-block and decoded-tile caching are disabled. The included server and TIFF fetches use `no-store`; restart `npm start` after server changes. `_headers` keeps application files uncached on hosts supporting that format; the remotely hosted compressed archive is the intentional caching exception.
