// One active and one latest pending transform per graph role. Playback never
// enqueues work, and rapid pointer motion cannot build an analysis backlog.
export class AnalysisClient {
  constructor() {
    this.worker = null; this.nextId = 0; this.active = null; this.queued = new Map(); this.failed = null;
  }
  analyze(values, role = 'hover') {
    return new Promise((resolve, reject) => {
      if (this.failed) { reject(this.failed); return; }
      const previous = this.queued.get(role);
      if (previous) previous.resolve(null);
      this.queued.set(role, { id: ++this.nextId, values, resolve, reject });
      this.drain();
    });
  }
  drain() {
    if (this.active || !this.queued.size) return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const job = this.active;
        if (job?.id !== data.id) return;
        this.active = null; job.resolve(data.amplitudes); this.drain();
      };
      this.worker.onerror = () => this.destroy(new Error('Frequency analysis worker stopped. Reload to retry.'));
    }
    const role = this.queued.has('pinned') ? 'pinned' : this.queued.keys().next().value;
    this.active = this.queued.get(role); this.queued.delete(role);
    const { id, values } = this.active;
    this.worker.postMessage({ id, values }, [values.buffer]);
  }
  destroy(error = new Error('Analysis closed.')) {
    this.failed = error; this.worker?.terminate();
    this.worker = null;
    this.active?.reject(error); this.active = null;
    for (const job of this.queued.values()) job.reject(error);
    this.queued.clear();
  }
}
