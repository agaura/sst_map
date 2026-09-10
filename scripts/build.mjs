import { build } from 'esbuild';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const options = { bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2022', legalComments: 'eof' };
await build({ ...options, stdin: { contents: "export * from 'd3';", resolveDir: process.cwd() }, outfile: 'vendor/d3.js' });
await build({ ...options, stdin: { contents: "export { fromUrl, fromCustomClient, GeoTIFF } from 'geotiff';", resolveDir: process.cwd() }, outfile: 'vendor/geotiff.js' });
const licenses = [], visited = new Set();
async function collect(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const dir = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
  const files = (await readdir(dir)).filter(file => /^(licen[sc]e|copying|notice)(\.|$)/i.test(file));
  const texts = await Promise.all(files.map(file => readFile(`${dir}/${file}`, 'utf8')));
  licenses.push(`--- ${name} ${pkg.version} (${pkg.license}) ---\n${texts.join('\n') || 'Upstream license notice is preserved in the bundled JavaScript. See package repository: ' + (pkg.repository?.url || pkg.homepage || '')}`);
  for (const dependency of Object.keys(pkg.dependencies || {})) await collect(dependency);
}
await collect('d3'); await collect('geotiff');
await writeFile('vendor/LICENSES.txt', licenses.join('\n\n'));
console.log('Local D3 and GeoTIFF bundles built; runtime has no CDN dependencies.');
