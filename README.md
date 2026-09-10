# Sea Surface Thermal Observatory

A WebGPU dashboard for the 2019 MUR sea-surface-temperature archive.

Run with Node.js 20 or newer:

```sh
npm start
```

Open **http://localhost:8768/main.html**. A WebGPU-capable browser and localhost or HTTPS are required. The dataset loads from https://pub-68cd895ae8ad4a04ae416191b982c1eb.r2.dev/mur_sst_cube_global.tif; a local TIFF is no longer required. Add your preview origin (for example, `http://localhost:8768`, without a trailing slash) to the R2 CORS allowed origins. Production uses `https://agaura.github.io`.

For local data, `config.local.json` can contain `{ "preferLocalDataset": true }` (see `config.local.example.json`). The app then checks for `mur_sst_cube_global.tif` beside `main.html` and uses it when present; otherwise it uses R2. Both the local configuration and TIFF are ignored by Git. Set the option to `false` or remove the configuration to always use R2. Use `npm start` for local TIFF byte-range support. This JSON file is browser-readable configuration, not a place for secrets.

Runtime libraries are included in `vendor/`; the dashboard makes no CDN requests. To rebuild them from the pinned dependencies:

```sh
npm ci
npm run build
npm test
```

The first load decodes the full archive in a worker, then transfers ownership of its frame buffers to the viewer once. This retains roughly 1 GiB of frame data, matching the original approach. After loading, scrubbing and temperature inspection read directly from memory, without network requests, worker round trips, or per-frame buffer copies. Frequency analysis runs synchronously on demand. Point histories and Fourier results are not cached.

Hover over the map to inspect a history; click to pin a location. Hover over the timeline to preview a frame; click to select it. Use the arrow keys on the timeline, or comma/period, to step frames. Drag the color cloud or the sphere to rotate it.

See [PROJECT_REVIEW.md](PROJECT_REVIEW.md) for implementation and validation details.

The viewer retains the loaded dataset as working data and releases workers, frame references, and GPU resources when you leave. GeoTIFF download-block and decoded-tile caching are disabled. The included server and TIFF fetches use `no-store`; restart `npm start` after server changes. When deploying elsewhere, configure `Cache-Control: no-store` for all responses (`_headers` is included for hosts supporting that format).
