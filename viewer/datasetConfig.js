// Production archive; local configuration can select the matching local file.
export const REMOTE_COMPRESSED_DATASET = 'https://pub-68cd895ae8ad4a04ae416191b982c1eb.r2.dev/mur_sst_cube_global.sstz';
const REMOTE_DATASET = REMOTE_COMPRESSED_DATASET || 'https://pub-68cd895ae8ad4a04ae416191b982c1eb.r2.dev/mur_sst_cube_global.tif';

export async function resolveDatasetUrl({ signal } = {}) {
  const configUrl = new URL('config.local.json', document.baseURI);
  let config;
  try {
    const response = await fetch(configUrl, { cache: 'no-store', signal });
    if (!response.ok) return REMOTE_DATASET;
    config = await response.json();
  } catch (error) {
    signal?.throwIfAborted();
    console.warn('Local dataset configuration unavailable; using R2.', error);
    return REMOTE_DATASET;
  }
  if (config?.preferLocalDataset !== true) return REMOTE_DATASET;
  const localUrl = new URL('mur_sst_cube_global.sstz', document.baseURI);
  try {
    const response = await fetch(localUrl, { method: 'HEAD', cache: 'no-store', signal });
    // Some static hosts return their HTML fallback for missing files.
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) return localUrl.href;
  } catch (error) {
    signal?.throwIfAborted();
    console.warn('Local dataset unavailable; using R2.', error);
  }
  return REMOTE_DATASET;
}
