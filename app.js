import { getDomElements } from './viewer/dom.js';
import { TemperatureViewer } from './viewer/controller.js';
export let viewer;
async function startViewer() {
  viewer = new TemperatureViewer(getDomElements());
  await viewer.init();
}
// Workers, decoded data and GPU allocations belong only to this page visit.
window.addEventListener('pagehide', () => viewer?.destroy());
window.addEventListener('pageshow', event => {
  // A restored history document has deliberately released its renderer/worker.
  if (event.persisted) window.location.reload();
});
startViewer().catch(error => console.error('Failed to start temperature viewer', error));
