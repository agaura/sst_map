# Sea Surface Thermal Observatory

An interactive WebGPU map of daily sea-surface temperatures for 2019. Explore a flat map or globe, inspect temperature histories and frequency spectra, and adjust palette hue, edge contrast, and HDR highlights. HDR is optional; WebGPU and a secure connection are required.

Run with Node.js 20 or newer:

```sh
npm start
```

Open **http://localhost:8768/main.html**. A WebGPU-capable browser and localhost or HTTPS are required. The dataset loads from https://pub-68cd895ae8ad4a04ae416191b982c1eb.r2.dev/mur_sst_cube_global.tif; a local TIFF is no longer required. Add your preview origin (for example, `http://localhost:8768`, without a trailing slash) to the R2 CORS allowed origins. Production uses `https://agaura.github.io`.

For local data, `config.local.json` can contain `{ "preferLocalDataset": true }` (see `config.local.example.json`). The app then checks for `mur_sst_cube_global.tif` beside `main.html` and uses it when present; otherwise it uses R2. Both the local configuration and TIFF are ignored by Git. Set the option to `false` or remove the configuration to always use R2. Use `npm start` for local TIFF byte-range support. This JSON file is browser-readable configuration, not a place for secrets.

Runtime libraries are included in `vendor/`. The dataset loads from R2 unless local mode is enabled. Google Analytics loads externally from Google, using measurement ID `G-BBWS173BMQ` in `main.html`. To rebuild the libraries from the pinned dependencies:

```sh
npm ci
npm run build
npm test
```

The first load decodes the full archive in a worker, then transfers ownership of its frame buffers to the viewer once. This retains roughly 1 GiB of frame data, matching the original approach. After loading, scrubbing and temperature inspection read directly from memory, without network requests, worker round trips, or per-frame buffer copies. Frequency analysis runs synchronously on demand. Point histories and Fourier results are not cached.

On desktop, hover over the flat map to inspect a history and click to pin a location. Hover over the timeline to preview a frame; click to select it. Use the arrow keys on the timeline, or comma/period, to step frames. Drag the color cloud or the sphere to rotate it.

On touchscreens, tap the flat map to pin a location and swipe vertically to scroll the page. Drag the timeline to select a frame and pause playback. The pinned location's coordinates and current temperature appear beneath the timeline. Playback controls and numeric inputs have larger touch targets. Reduced-motion preferences disable initial color-cloud auto-rotation; its checkbox can override that choice.

The archive is approximately 1.06 GB, with roughly another gigabyte of working memory needed for its decoded frames, plus transient decoding and graphics allocations. Loading may be demanding on phones or slow connections. The loader combines nearby ranges into batches of up to 16 MiB with two downloads in flight, and displays received bytes, elapsed time, and preparation status. Every fresh page load reads the dataset again.

For GitHub Pages, publish the HTML, CSS, JavaScript, `viewer/`, and `vendor/` with their relative paths intact. The local TIFF and configuration are not required. R2 must allow the deployed origin and range requests and expose `Content-Range`. For iPhone testing, use the deployed HTTPS URL: a plain HTTP LAN address is not a secure context for WebGPU.

The viewer retains the loaded dataset as working data and releases workers, frame references, and GPU resources when you leave. GeoTIFF download-block and decoded-tile caching are disabled. The included server and TIFF fetches use `no-store`; restart `npm start` after server changes. When deploying elsewhere, configure `Cache-Control: no-store` for all responses (`_headers` is included for hosts supporting that format).
