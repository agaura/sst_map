import { graphLayout } from './graphLayout.js';
import * as d3 from '../vendor/d3.js';
import { fourierAmplitudes } from './analysis.js';
import { createInitialState } from './state.js';
import { createRenderingContext } from './rendering.js';
import { hideLoadingOverlay, showLoadingError } from './dom.js';
import { loadTemperatureCube } from './dataLoaders.js';
import { resolveDatasetUrl } from './datasetConfig.js';

const DEFAULT_PLAYBACK_FPS = 20;
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const STEP_HOLD_INITIAL_DELAY_MS = 300;
const STEP_HOLD_REPEAT_MS = 80;
const START_DATE_UTC = Date.UTC(2019, 0, 1);
const DISPLAY_RANGE_MIN = -2;
const DISPLAY_RANGE_MAX = 36;
const EMPHASIS_TICK_HIDE_THRESHOLD_C = 2.75;
const GRAPH_REVEAL_BLEED_X = 6;
const GRAPH_COVER_OVERSCAN_X = 1;
const GRAPH_COVER_OVERSCAN_Y = 1;

export class TemperatureViewer {
  constructor(elements) {
    this.elements = elements;
    this.state = createInitialState();
    this.rendering = null;
    this.lifetime = new AbortController();
    this.destroyed = false;
    this.timelineScale = null;
    this.playbackTimer = null;
    this.playbackFps = readFps(elements.fpsSlider, DEFAULT_PLAYBACK_FPS);
    this.paletteBasePosition = 0.5;
    this.paletteEmphasisPosition = this.paletteBasePosition;
    this.paletteEmphasisBase = elements.emphasisToggle.checked;
    this.temperatureGraph = null;
    this.hoverSeriesRequestId = 0;
    this.hoverSeries = null;
    this.pinnedSeries = null;
    this.signalAnalysisEnabled = false;
    this.signalAnalysisBeforeSphere = null;
    this.fourierMode = Boolean(elements.graphFourierToggle?.checked);
    this.stepHoldTimeout = null;
    this.stepHoldInterval = null;
    this.suppressNextStepClick = false;
  }

  async init() {
    try {
      this.rendering = await createRenderingContext(this.elements);
      if (this.destroyed) { this.rendering.destroy(); return; }
      await this.loadInitialData();
      if (this.destroyed) return;
      this.attachEventListeners();
      this.attachPaletteListeners();
    } catch (error) {
      if (this.destroyed) return;
      console.error('Failed to initialize temperature viewer', error);
      this.rendering?.setLiveStatusColor(4, 0, 0);
      document.getElementById('playback-status').textContent = 'Archive / unavailable';
      showLoadingError(this.elements, error.message);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifetime.abort();
    this.state.initialized = false;
    this.state.pendingFrameRequestId++;
    this.hoverSeriesRequestId++;
    window.clearInterval(this.playbackTimer);
    this.stopStepHold();
    this.graphResizeObserver?.disconnect();
    this.rendering?.destroy();
    this.rendering = null;
    this.state.cube?.destroy();
    this.hoverSeries = this.pinnedSeries = this.temperatureGraph = null;
    this.state.cube = this.state.hoverPoint = this.state.pinnedPoint = null;
    this.signalAnalysisBeforeSphere = null;
  }

  listen(target, type, callback) {
    target?.addEventListener(type, callback, { signal: this.lifetime.signal });
  }

  attachEventListeners() {
    const timeline = this.elements.frameTimeline;
    const { fpsSlider, fpsValueLabel, framePrevButton, frameNextButton } = this.elements;
    this.listen(timeline, 'pointerdown', (event) => {
      if (!this.state.initialized) return;
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        event.preventDefault();
        timeline.setPointerCapture(event.pointerId);
        this.pause();
        this.selectFrame(this.frameIndexFromPointer(event));
      }
      if (event.pointerType === 'mouse') {
        event.preventDefault();
      }
    });
    this.listen(timeline, 'pointerenter', () => {
      this.state.isTimelineHovered = true;
    });
    this.listen(timeline, 'pointermove', (event) => {
      if (timeline.hasPointerCapture(event.pointerId)) {
        this.selectFrame(this.frameIndexFromPointer(event));
        return;
      }
      this.previewFrame(this.frameIndexFromPointer(event));
    });
    const releaseTimeline = event => {
      if (timeline.hasPointerCapture(event.pointerId)) timeline.releasePointerCapture(event.pointerId);
      this.state.isTimelineHovered = false;
    };
    this.listen(timeline, 'pointerup', releaseTimeline);
    this.listen(timeline, 'pointercancel', releaseTimeline);
    this.listen(timeline, 'pointerleave', () => {
      this.state.isTimelineHovered = false;
      if (!this.state.isPlaying) {
        this.setDisplayFrame(this.state.selectedFrameIndex).catch((error) => {
          console.error('Unable to restore selected temperature frame', error);
        });
      }
    });
    this.listen(timeline, 'click', (event) => {
      this.pause();
      this.selectFrame(this.frameIndexFromPointer(event));
    });
    this.listen(timeline, 'keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      this.stepFrame(step);
    });
    this.listen(this.elements.playToggle, 'click', () => {
      if (this.state.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    });
    this.attachStepButtonListeners(framePrevButton, -1);
    this.attachStepButtonListeners(frameNextButton, 1);
    this.listen(window, 'keydown', (event) => {
      if (event.key !== ',' && event.key !== '.') {
        return;
      }
      if (isEditableKeyTarget(event.target)) {
        return;
      }
      event.preventDefault();
      this.stepFrame(event.key === ',' ? -1 : 1);
    });
    const updatePlaybackFps = () => {
      this.playbackFps = readFps(fpsSlider, DEFAULT_PLAYBACK_FPS);
      fpsValueLabel.textContent = String(this.playbackFps);
      if (this.state.isPlaying) {
        this.startPlaybackTimer();
      }
    };
    updatePlaybackFps();
    this.listen(fpsSlider, 'input', updatePlaybackFps);
    this.attachTemperatureGraphListeners();
    this.graphResizeObserver = new ResizeObserver(() => {
      if (this.state.initialized && !this.destroyed) this.createTemperatureGraph();
    });
    this.graphResizeObserver.observe(this.elements.temperatureGraph);
    this.graphResizeObserver.observe(this.elements.frameTimeline);
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.stopStepHold();
    });
  }

  attachStepButtonListeners(button, step) {
    if (!button) {
      return;
    }
    this.listen(button, 'click', () => {
      if (this.suppressNextStepClick) {
        this.suppressNextStepClick = false;
        return;
      }
      this.stepFrame(step);
    });
    this.listen(button, 'pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.suppressNextStepClick = true;
      this.stepFrame(step);
      this.startStepHold(step);
    });
    const stop = (event) => {
      this.stopStepHold();
      if (event.pointerId !== undefined && button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };
    this.listen(button, 'pointerup', stop);
    this.listen(button, 'pointercancel', stop);
    this.listen(button, 'lostpointercapture', () => this.stopStepHold());
  }

  attachPaletteListeners() {
    const { paletteSlider, paletteValueLabel, edgeContrastControl, edgeContrastToggle, edgeContrastSlider, edgeContrastValueLabel, hdrToggle, sphereToggle, emphasisToggle, stripCanvas } = this.elements;
    const applyHue = (value) => {
      paletteSlider.value = value.toFixed(3);
      paletteValueLabel.value = value.toFixed(3);
      this.rendering.setPalette(value);
    };
    const applyEdgeContrast = (value, enabled = edgeContrastToggle.checked) => {
      edgeContrastSlider.value = value.toFixed(3);
      edgeContrastValueLabel.value = value.toFixed(3);
      edgeContrastControl?.classList.toggle('is-effect-disabled', !enabled);
      this.rendering.setEdgeContrast(enabled ? value : 0);
    };
    bindSyncedNumberControl({
      signal: this.lifetime.signal,
      slider: paletteSlider,
      input: paletteValueLabel,
      decimals: 3,
      onValue: applyHue,
    });
    bindSyncedNumberControl({
      signal: this.lifetime.signal,
      slider: edgeContrastSlider,
      input: edgeContrastValueLabel,
      decimals: 3,
      beforeValue: () => {
        edgeContrastToggle.checked = true;
      },
      onValue: (value) => applyEdgeContrast(value, true),
    });
    applyHue(readControlValue(paletteSlider, 5));
    applyEdgeContrast(readControlValue(edgeContrastSlider, 1), edgeContrastToggle.checked);
    this.listen(edgeContrastToggle, 'change', () => {
      applyEdgeContrast(readControlValue(edgeContrastSlider, 1), edgeContrastToggle.checked);
    });
    this.listen(hdrToggle, 'change', () => {
      this.rendering.setHdrEnabled(hdrToggle.checked);
    });
    this.listen(sphereToggle, 'change', () => {
      const spherical = sphereToggle.checked;
      if (spherical) {
        const activePoint = this.state.pinnedPoint || this.state.hoverPoint;
        this.signalAnalysisBeforeSphere = {
          enabled: this.signalAnalysisEnabled,
          point: activePoint ? { ...activePoint } : null,
        };
        this.setSignalAnalysisEnabled(false);
      }
      if (this.elements.signalAnalysisToggle) {
        this.elements.signalAnalysisToggle.disabled = spherical;
      }
      this.rendering.setSphericalViewEnabled(spherical);
      this.elements.imageCanvas.classList.toggle('is-spherical', spherical);
      if (!spherical) {
        this.restoreSignalAnalysisAfterSphere();
      }
    });
    this.listen(emphasisToggle, 'change', () => {
      this.paletteEmphasisBase = emphasisToggle.checked;
      this.setPaletteEmphasisEnabled(this.paletteEmphasisBase);
      this.setPaletteEmphasisPosition(this.paletteBasePosition);
    });
    this.listen(stripCanvas, 'pointerenter', () => {
      emphasisToggle.checked = true;
      this.setPaletteEmphasisEnabled(true);
      this.setPaletteEmphasisPosition(this.paletteBasePosition);
    });
    this.listen(stripCanvas, 'pointermove', (event) => {
      emphasisToggle.checked = true;
      this.setPaletteEmphasisEnabled(true);
      this.setPaletteEmphasisPosition(this.palettePositionFromPointer(event));
    });
    this.listen(stripCanvas, 'pointerdown', (event) => {
      this.paletteBasePosition = this.palettePositionFromPointer(event);
      this.paletteEmphasisBase = true;
      emphasisToggle.checked = true;
      this.setPaletteEmphasisEnabled(true);
      this.setPaletteEmphasisPosition(this.paletteBasePosition);
    });
    this.listen(stripCanvas, 'pointerleave', () => {
      emphasisToggle.checked = this.paletteEmphasisBase;
      this.setPaletteEmphasisEnabled(this.paletteEmphasisBase);
      this.setPaletteEmphasisPosition(this.paletteBasePosition);
    });
    this.updateEmphasisTemperatureTick();
  }

  async loadInitialData() {
    const started = performance.now();
    const bar = document.getElementById('loading-progress');
    const details = document.getElementById('loading-details');
    let progress = { received: 0, requested: 0, stage: 'Connecting' };
    const updateProgress = () => {
      if (!bar || !details) return;
      const seconds = Math.floor((performance.now() - started) / 1000);
      const downloading = progress.requested > progress.received;
      if (downloading) bar.value = Math.min(1, progress.received / progress.requested);
      else bar.removeAttribute('value');
      details.textContent = `${progress.stage} · ${(progress.received / 1048576).toFixed(1)} MB received · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} elapsed`;
    };
    updateProgress();
    const timer = setInterval(updateProgress, 1000);
    let cube;
    try {
      const datasetUrl = await resolveDatasetUrl({ signal: this.lifetime.signal });
      cube = await loadTemperatureCube(datasetUrl, {
        signal: this.lifetime.signal,
        onProgress: value => { progress = value; updateProgress(); },
      });
    } finally {
      clearInterval(timer);
    }
    if (this.destroyed) { cube.destroy(); return; }
    this.state.cube = cube;
    this.state.width = cube.width;
    this.state.height = cube.height;
    this.state.frameCount = cube.frameCount;
    this.elements.temperatureRange.textContent = `−2 to 36 °C · Daily observations · 2019`;

    this.rendering.setSize(cube.width, cube.height);
    this.createTimeline();
    this.createTemperatureGraph();
    this.state.initialized = true;
    await this.setDisplayFrame(0);
    hideLoadingOverlay(this.elements);
    this.play();
  }

  async setDisplayFrame(index) {
    if (!this.state.initialized || !Number.isInteger(index) || index < 0 || index >= this.state.frameCount) {
      return;
    }
    const requestId = ++this.state.pendingFrameRequestId;
    const frame = this.state.cube.readFrame(index);
    if (!frame || requestId !== this.state.pendingFrameRequestId) {
      return;
    }
    this.state.displayFrameIndex = index;
    this.rendering.setFrame(frame, this.state.width, this.state.height);
    this.updateLabels();
    this.updateTimelineMarker(index);
    this.updateCurrentGraphPoint();
  }

  previewFrame(index) {
    if (!Number.isInteger(index) || index === this.state.displayFrameIndex) {
      return;
    }
    this.setDisplayFrame(index).catch((error) => {
      console.error('Unable to preview temperature frame', error);
    });
  }

  selectFrame(index) {
    if (!Number.isInteger(index)) {
      return;
    }
    this.state.selectedFrameIndex = index;
    this.setDisplayFrame(index).catch((error) => {
      console.error('Unable to select temperature frame', error);
    });
  }

  stepFrame(step) {
    if (!this.state.initialized || !Number.isInteger(step) || step === 0) {
      return;
    }
    this.pause();
    const baseIndex = this.state.selectedFrameIndex;
    const index = clamp(baseIndex + step, 0, this.state.frameCount - 1);
    this.selectFrame(index);
  }

  startStepHold(step) {
    this.stopStepHold();
    this.stepHoldTimeout = window.setTimeout(() => {
      this.stepHoldTimeout = null;
      this.stepHoldInterval = window.setInterval(() => this.stepFrame(step), STEP_HOLD_REPEAT_MS);
    }, STEP_HOLD_INITIAL_DELAY_MS);
  }

  stopStepHold() {
    window.clearTimeout(this.stepHoldTimeout);
    window.clearInterval(this.stepHoldInterval);
    this.stepHoldTimeout = null;
    this.stepHoldInterval = null;
  }

  play() {
    if (!this.state.initialized) {
      return;
    }
    this.state.isPlaying = true;
    this.rendering?.setLiveStatusColor(0, 4, 0);
    this.updatePlaybackControl();
    this.startPlaybackTimer();
  }

  startPlaybackTimer() {
    window.clearInterval(this.playbackTimer);
    this.playbackTimer = window.setInterval(() => {
      if (this.state.isTimelineHovered || document.hidden || this.playbackFramePending) {
        return;
      }
      const nextIndex = (this.state.displayFrameIndex + 1) % this.state.frameCount;
      this.state.selectedFrameIndex = nextIndex;
      this.playbackFramePending = true;
      this.setDisplayFrame(nextIndex).catch((error) => {
        console.error('Unable to advance temperature animation', error);
      }).finally(() => { this.playbackFramePending = false; });
    }, 1000 / this.playbackFps);
  }

  pause() {
    this.state.isPlaying = false;
    this.rendering?.setLiveStatusColor(4, 0, 0);
    window.clearInterval(this.playbackTimer);
    this.playbackTimer = null;
    this.state.selectedFrameIndex = this.state.displayFrameIndex;
    this.updatePlaybackControl();
  }

  updatePlaybackControl() {
    const isPlaying = this.state.isPlaying;
    this.elements.playToggle.textContent = isPlaying ? 'Pause' : 'Play';
    document.getElementById('playback-status').textContent = isPlaying ? 'Archive / playing' : 'Archive / paused';
    this.elements.playToggle.setAttribute('aria-label', isPlaying ? 'Pause animation' : 'Play animation');
    if (this.elements.stepControls) {
      this.elements.stepControls.hidden = isPlaying;
    }
  }

  createTimeline() {
    const width = this.state.width;
    const height = 72;
    const timeline = d3.select(this.elements.frameTimeline)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none')
      .attr('aria-valuemax', String(this.state.frameCount));
    timeline.selectAll('*').remove();
    this.timelineScale = d3.scaleLinear()
      .domain([0, Math.max(1, this.state.frameCount - 1)])
      .range([0, width]);
    const frames = d3.range(this.state.frameCount);
    timeline.append('g')
      .attr('class', 'timeline-ticks timeline-ticks--top')
      .selectAll('line')
      .data(frames)
      .join('line')
      .attr('x1', (index) => this.timelineScale(index))
      .attr('x2', (index) => this.timelineScale(index))
      .attr('y1', 0)
      .attr('y2', (index) => tickLength(index));
    timeline.append('g')
      .attr('class', 'timeline-ticks timeline-ticks--bottom')
      .selectAll('line')
      .data(frames)
      .join('line')
      .attr('x1', (index) => this.timelineScale(index))
      .attr('x2', (index) => this.timelineScale(index))
      .attr('y1', height)
      .attr('y2', (index) => height - tickLength(index));
    timeline.append('line')
      .attr('class', 'timeline-marker')
      .attr('y1', 0)
      .attr('y2', height);
  }

  updateTimelineMarker(index) {
    d3.select(this.elements.frameTimeline)
      .attr('aria-valuenow', String(index + 1))
      .select('.timeline-marker')
      .attr('x1', this.timelineScale(index))
      .attr('x2', this.timelineScale(index));
  }

  createTemperatureGraph() {
    const { temperatureGraph, pointOverlay } = this.elements;
    if (!temperatureGraph || !pointOverlay) {
      return;
    }
    const { width: graphWidth, height: graphHeight, margin: graphMargin } = graphLayout(
      temperatureGraph.getBoundingClientRect(), this.elements.frameTimeline.getBoundingClientRect(),
    );
    const palette = this.elements.graphPaletteCanvas;
    if (palette) {
      palette.style.left = `${(graphMargin.left - GRAPH_REVEAL_BLEED_X) / graphWidth * 100}%`;
      palette.style.top = `${graphMargin.top / graphHeight * 100}%`;
      palette.style.width = `${(graphWidth - graphMargin.left + GRAPH_REVEAL_BLEED_X) / graphWidth * 100}%`;
      palette.style.height = `${(graphHeight - graphMargin.top - graphMargin.bottom) / graphHeight * 100}%`;
    }
    const chart = d3.select(temperatureGraph);
    chart.classed('is-ready', false);
    chart.classed('is-fourier', this.fourierMode);
    chart.selectAll('svg').remove();
    const svg = chart.append('svg')
      .attr('class', 'temperature-graph-svg')
      .attr('viewBox', `0 0 ${graphWidth} ${graphHeight}`)
      // Scale uniformly so labels and ticks retain their natural proportions.
      .attr('preserveAspectRatio', 'xMinYMin meet');
    const xDomain = this.fourierMode
      ? [0, Math.max(1, Math.floor((this.state.frameCount || 1) / 2))]
      : [0, Math.max(1, this.state.frameCount - 1)];
    const yDomain = this.fourierMode ? [0.01, 40] : [DISPLAY_RANGE_MIN, DISPLAY_RANGE_MAX];
    const xScale = d3.scaleLinear()
      .domain(xDomain)
      .range([graphMargin.left, graphWidth - graphMargin.right]);
    const yScale = (this.fourierMode ? d3.scaleLog() : d3.scaleLinear())
      .domain(yDomain)
      .range([graphHeight - graphMargin.bottom, graphMargin.top]);
    const line = d3.line()
      .defined((datum) => Number.isFinite(datum.value))
      .x((datum) => xScale(datum.index))
      .y((datum) => yScale(clamp(datum.value, yDomain[0], yDomain[1])));

    const monthTicks = monthTickIndexes(this.state.frameCount);
    const xTicks = this.fourierMode ? xScale.ticks(5).map(Math.round) : monthTicks;
    const plotHeight = graphHeight - graphMargin.top - graphMargin.bottom;
    const yTicks = this.fourierMode
      ? (plotHeight < 50 ? [0.01, 40] : [0.01, 0.1, 1, 10, 40])
      : (plotHeight < 38 ? [-2, 36] : plotHeight < 70 ? [-2, 20, 36] : [-2, 0, 10, 20, 30, 36]);
    const revealLayer = svg.append('g').attr('class', 'temperature-graph-reveal-layer');
    const overlayLayer = svg.append('g').attr('class', 'temperature-graph-overlay-layer');
    const maskId = 'temperature-line-mask';
    const mask = svg.append('defs')
      .append('mask')
      .attr('id', maskId)
      .attr('maskUnits', 'userSpaceOnUse');
    mask.append('rect')
      .attr('x', -GRAPH_REVEAL_BLEED_X)
      .attr('width', graphWidth + GRAPH_REVEAL_BLEED_X * 2)
      .attr('height', graphHeight)
      .attr('fill', 'white');
    const pinnedMaskPath = mask.append('path')
      .attr('class', 'temperature-series-mask temperature-series-mask--pinned')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');
    const hoverMaskPath = mask.append('path')
      .attr('class', 'temperature-series-mask temperature-series-mask--hover')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('stroke-width', 2.5)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');
    const currentMaskPoint = mask.append('circle')
      .attr('class', 'temperature-current-mask-point')
      .attr('r', 0)
      .attr('fill', 'black');

    revealLayer.append('rect')
      .attr('class', 'temperature-graph-cover')
      .attr('x', graphMargin.left - GRAPH_REVEAL_BLEED_X - GRAPH_COVER_OVERSCAN_X)
      .attr('y', graphMargin.top - GRAPH_COVER_OVERSCAN_Y)
      .attr('width', graphWidth - graphMargin.left - graphMargin.right + (GRAPH_REVEAL_BLEED_X + GRAPH_COVER_OVERSCAN_X) * 2)
      .attr('height', graphHeight - graphMargin.top - graphMargin.bottom + GRAPH_COVER_OVERSCAN_Y * 2)
      .attr('mask', `url(#${maskId})`);

    // Punch the curve out of the grid as well as the background cover. The
    // original GPU palette is now uninterrupted at grid crossings.
    const gridLayer = overlayLayer.append('g').attr('mask', `url(#${maskId})`);
    gridLayer.append('g')
      .attr('class', 'temperature-graph-grid')
      .attr('transform', `translate(${graphMargin.left},0)`)
      .call(d3.axisLeft(yScale)
        .tickValues(yTicks)
        .tickSize(-(graphWidth - graphMargin.left - graphMargin.right))
        .tickFormat(''));
    gridLayer.append('g')
      .attr('class', 'temperature-graph-grid temperature-graph-grid--months')
      .attr('transform', `translate(0,${graphHeight - graphMargin.bottom})`)
      .call(d3.axisBottom(xScale)
        .tickValues(xTicks)
        .tickSize(-(graphHeight - graphMargin.top - graphMargin.bottom))
        .tickFormat(''));
    gridLayer.append('line')
      .attr('class', 'temperature-graph-edge-line')
      .attr('x1', graphWidth - graphMargin.right)
      .attr('x2', graphWidth - graphMargin.right)
      .attr('y1', graphMargin.top)
      .attr('y2', graphHeight - graphMargin.bottom);
    overlayLayer.append('g')
      .attr('class', 'temperature-graph-axis temperature-graph-axis--x')
      .attr('transform', `translate(0,${graphHeight - graphMargin.bottom})`)
      .call(d3.axisBottom(xScale)
        .tickValues(xTicks)
        .tickFormat((index) => this.fourierMode ? `${Math.round(index)}` : monthLabel(index)));
    overlayLayer.append('g')
      .attr('class', 'temperature-graph-axis temperature-graph-axis--y')
      .attr('transform', `translate(${graphMargin.left},0)`)
      .call(d3.axisLeft(yScale)
        .tickValues(yTicks)
        .tickFormat((value) => this.fourierMode ? formatAmplitudeTick(value) : `${value}`));
    const graphTitleLabel = overlayLayer.append('text')
      .attr('class', 'temperature-graph-label')
      .attr('x', graphMargin.left)
      .attr('y', Math.max(6, graphMargin.top - 8))
      .text(this.fourierMode ? 'Fourier at --' : 'Temperature at --');
    const currentValueLabel = overlayLayer.append('text')
      .attr('class', 'temperature-graph-current-value')
      .attr('x', graphWidth - graphMargin.right)
      .attr('y', Math.max(6, graphMargin.top - 8))
      .attr('text-anchor', 'end')
      .text(this.fourierMode ? 'Amplitude' : '-- °C');
    const pinnedPath = overlayLayer.append('path').attr('class', 'temperature-series temperature-series--pinned');
    const hoverPath = overlayLayer.append('path').attr('class', 'temperature-series temperature-series--hover');
    const pinnedBars = overlayLayer.append('g').attr('class', 'temperature-bars temperature-bars--pinned');
    const hoverBars = overlayLayer.append('g').attr('class', 'temperature-bars temperature-bars--hover');
    const currentPoint = overlayLayer.append('circle').attr('class', 'temperature-current-point').attr('r', 0);

    d3.select(pointOverlay)
      .attr('viewBox', `0 0 ${this.state.width} ${this.state.height}`)
      .attr('preserveAspectRatio', 'none')
      .selectAll('*')
      .remove();
    const overlay = d3.select(pointOverlay);
    const pinnedCircle = createPointMarker(overlay, 'point-marker--pinned');
    const hoverCircle = createPointMarker(overlay, 'point-marker--hover');
    this.temperatureGraph = {
      chart,
      width: graphWidth,
      line,
      xScale,
      yScale,
      hoverPath,
      pinnedPath,
      hoverBars,
      pinnedBars,
      hoverMaskPath,
      pinnedMaskPath,
      currentMaskPoint,
      currentPoint,
      graphTitleLabel,
      currentValueLabel,
      hoverCircle,
      pinnedCircle,
    };
    this.renderGraphSeries();
    chart.classed('is-ready', true);
    this.updatePointOverlay();
    this.updateTemperatureGraphVisibility();
    this.updateCurrentGraphPoint();
  }

  attachTemperatureGraphListeners() {
    const { imageCanvas, temperatureGraph, signalAnalysisToggle, graphTemperatureToggle, graphFourierToggle } = this.elements;
    if (!imageCanvas) {
      return;
    }
    this.listen(signalAnalysisToggle, 'change', () => {
      if (this.elements.sphereToggle?.checked) {
        signalAnalysisToggle.checked = false;
        return;
      }
      this.setSignalAnalysisEnabled(signalAnalysisToggle.checked, {
        createDefaultPoint: signalAnalysisToggle.checked,
      });
    });
    this.listen(imageCanvas, 'pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      if (this.state.initialized && !this.elements.sphereToggle?.checked && !this.signalAnalysisEnabled) {
        this.setSignalAnalysisEnabled(true);
      }
    });
    this.listen(imageCanvas, 'pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      if (!this.state.initialized || this.elements.sphereToggle?.checked) {
        return;
      }
      if (!this.signalAnalysisEnabled) {
        this.setSignalAnalysisEnabled(true);
      }
      const point = this.pixelFromCanvasPointer(event);
      if (!point || samePoint(point, this.state.hoverPoint)) {
        return;
      }
      this.state.hoverPoint = point;
      this.hoverSeries = null;
      this.updatePointOverlay();
      this.updateCurrentGraphPoint();
      this.updateHoverSeries(point).catch((error) => {
        console.error('Unable to update hover temperature graph', error);
      });
    });
    this.listen(imageCanvas, 'pointerleave', () => {
      this.state.hoverPoint = null;
      this.hoverSeriesRequestId += 1;
      this.updatePointOverlay();
      if (this.temperatureGraph) {
        this.temperatureGraph.hoverPath.attr('d', null);
        this.temperatureGraph.hoverMaskPath.attr('d', null);
        this.temperatureGraph.hoverBars.selectAll('line').remove();
      }
      this.hoverSeries = null;
      this.updateCurrentGraphPoint();
      this.updateTemperatureGraphVisibility();
      if (!this.state.pinnedPoint) {
        this.setSignalAnalysisEnabled(false);
      }
    });
    this.listen(imageCanvas, 'click', (event) => {
      if (!this.state.initialized || this.elements.sphereToggle?.checked) {
        return;
      }
      const point = this.pixelFromCanvasPointer(event);
      if (!point) {
        return;
      }
      this.setSignalAnalysisEnabled(true);
      this.state.pinnedPoint = point;
      this.pinnedSeries = null;
      this.updatePointOverlay();
      this.updatePinnedSeries(point).catch((error) => {
        console.error('Unable to pin temperature graph', error);
      });
    });
    if (!temperatureGraph) {
      return;
    }
    const updateGraphMode = () => {
      this.fourierMode = graphFourierToggle.checked;
      this.createTemperatureGraph();
    };
    this.listen(graphTemperatureToggle, 'change', updateGraphMode);
    this.listen(graphFourierToggle, 'change', updateGraphMode);
    this.listen(temperatureGraph, 'pointermove', (event) => {
      if (this.fourierMode) {
        return;
      }
      if (event.target.closest?.('text') || window.getSelection()?.type === 'Range') {
        return;
      }
      event.preventDefault();
      const index = this.frameIndexFromGraphPointer(event);
      if (!Number.isInteger(index)) {
        return;
      }
      this.previewFrame(index);
      this.emphasizeGraphTemperature(index, false);
    });
    this.listen(temperatureGraph, 'pointerleave', () => {
      if (this.fourierMode) {
        return;
      }
      this.elements.emphasisToggle.checked = this.paletteEmphasisBase;
      this.setPaletteEmphasisEnabled(this.paletteEmphasisBase);
      this.setPaletteEmphasisPosition(this.paletteBasePosition);
      if (!this.state.isPlaying) {
        this.setDisplayFrame(this.state.selectedFrameIndex).catch((error) => {
          console.error('Unable to restore selected graph frame', error);
        });
      }
    });
    this.listen(temperatureGraph, 'click', (event) => {
      if (this.fourierMode) {
        return;
      }
      if (event.target.closest?.('text') || window.getSelection()?.type === 'Range') {
        return;
      }
      event.preventDefault();
      const index = this.frameIndexFromGraphPointer(event);
      if (!Number.isInteger(index)) {
        return;
      }
      this.pause();
      this.selectFrame(index);
      this.emphasizeGraphTemperature(index, true);
    });
  }

  setSignalAnalysisEnabled(enabled, { createDefaultPoint = false } = {}) {
    this.signalAnalysisEnabled = Boolean(enabled);
    document.querySelector('.analysis-panel').classList.toggle('is-active', this.signalAnalysisEnabled);
    const { signalAnalysisToggle, signalAnalysisState, signalAnalysisContent } = this.elements;
    if (signalAnalysisToggle) {
      signalAnalysisToggle.checked = this.signalAnalysisEnabled;
    }
    if (signalAnalysisState) {
      signalAnalysisState.textContent = this.signalAnalysisEnabled ? 'On' : 'Off';
    }
    if (signalAnalysisContent) {
      signalAnalysisContent.hidden = !this.signalAnalysisEnabled;
    }

    if (!this.signalAnalysisEnabled) {
      this.state.hoverPoint = null;
      this.state.pinnedPoint = null;
      this.hoverSeriesRequestId += 1;
      this.hoverSeries = null;
      this.pinnedSeries = null;
      this.renderGraphSeries();
      this.updatePointOverlay();
      this.updateCurrentGraphPoint();
      return;
    }

    if (createDefaultPoint && this.state.initialized && !this.state.pinnedPoint) {
      const point = {
        x: Math.floor(this.state.width / 2),
        y: Math.floor(this.state.height / 2),
      };
      this.state.pinnedPoint = point;
      this.pinnedSeries = null;
      this.updatePointOverlay();
      this.updatePinnedSeries(point).catch((error) => {
        console.error('Unable to initialize center temperature graph', error);
      });
    }
  }

  restoreSignalAnalysisAfterSphere() {
    const previous = this.signalAnalysisBeforeSphere;
    this.signalAnalysisBeforeSphere = null;
    if (!previous?.enabled || !this.state.initialized) {
      return;
    }
    const point = previous.point || {
      x: Math.floor(this.state.width / 2),
      y: Math.floor(this.state.height / 2),
    };
    this.setSignalAnalysisEnabled(true);
    this.state.pinnedPoint = point;
    this.pinnedSeries = null;
    this.updatePointOverlay();
    this.updatePinnedSeries(point).catch((error) => {
      console.error('Unable to restore temperature graph after sphere view', error);
    });
  }

  pixelFromCanvasPointer(event) {
    const rect = this.elements.imageCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    const x = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * this.state.width), 0, this.state.width - 1);
    const y = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * this.state.height), 0, this.state.height - 1);
    return { x, y };
  }

  async updateHoverSeries(point) {
    const requestId = ++this.hoverSeriesRequestId;
    const series = this.getPointSeries(point);
    if (!series || requestId !== this.hoverSeriesRequestId || !samePoint(point, this.state.hoverPoint)) {
      return;
    }
    this.hoverSeries = series;
    this.renderGraphSeries();
    this.updateCurrentGraphPoint();
    this.updateTemperatureGraphVisibility();
  }

  async updatePinnedSeries(point) {
    const series = this.getPointSeries(point);
    if (!series || !samePoint(point, this.state.pinnedPoint)) {
      return;
    }
    this.pinnedSeries = series;
    this.renderGraphSeries();
    this.updateCurrentGraphPoint();
    this.updateTemperatureGraphVisibility();
  }

  getPointSeries(point) {
    return this.state.cube.readPointSeries(point.x, point.y);
  }

  updatePointOverlay() {
    if (!this.temperatureGraph) {
      return;
    }
    setPointCircle(this.temperatureGraph.hoverCircle, this.state.hoverPoint);
    setPointCircle(this.temperatureGraph.pinnedCircle, this.state.pinnedPoint);
  }

  updateTemperatureGraphVisibility() {
    if (!this.temperatureGraph) {
      return;
    }
    this.temperatureGraph.chart.classed('is-visible', true);
  }

  graphDisplaySeries(rawSeries = this.hoverSeries || this.pinnedSeries) {
    if (!rawSeries) {
      return [];
    }
    if (!this.fourierMode) return rawSeries;
    const values = Float32Array.from(rawSeries, datum => datum.value);
    return Array.from(fourierAmplitudes(values), (value, index) => ({ index, value }));
  }

  renderGraphSeries() {
    if (!this.temperatureGraph) {
      return;
    }
    const hoverDisplay = this.graphDisplaySeries(this.hoverSeries);
    const pinnedDisplay = this.graphDisplaySeries(this.pinnedSeries);
    const hoverPathData = hoverDisplay.length ? this.temperatureGraph.line(hoverDisplay) : null;
    const pinnedPathData = pinnedDisplay.length ? this.temperatureGraph.line(pinnedDisplay) : null;
    if (this.fourierMode) {
      this.temperatureGraph.hoverPath.attr('d', null);
      this.temperatureGraph.pinnedPath.attr('d', null);
      this.temperatureGraph.hoverMaskPath.attr('d', null);
      this.temperatureGraph.pinnedMaskPath.attr('d', null);
      renderFourierBars(this.temperatureGraph.hoverBars, hoverDisplay, this.temperatureGraph.xScale, this.temperatureGraph.yScale);
      renderFourierBars(this.temperatureGraph.pinnedBars, pinnedDisplay, this.temperatureGraph.xScale, this.temperatureGraph.yScale);
    } else {
      this.temperatureGraph.hoverBars.selectAll('line').remove();
      this.temperatureGraph.pinnedBars.selectAll('line').remove();
      this.temperatureGraph.hoverPath.attr('d', hoverPathData);
      this.temperatureGraph.pinnedPath.attr('d', pinnedPathData);
      this.temperatureGraph.hoverMaskPath.attr('d', hoverPathData);
      this.temperatureGraph.pinnedMaskPath.attr('d', pinnedPathData);
    }
  }

  updateCurrentGraphPoint() {
    const readout = document.getElementById('selected-location');
    if (readout) {
      const point = this.state.pinnedPoint;
      readout.hidden = !point;
      if (point) {
        const value = this.pinnedSeries?.[this.state.displayFrameIndex]?.value;
        readout.textContent = `${formatLatLon(pixelToLatLon(point, this.state.width, this.state.height))} · ${Number.isFinite(value) ? `${formatTemperature(value)} °C` : 'No temperature data'}`;
      }
    }
    if (!this.temperatureGraph) {
      return;
    }
    const activePoint = this.state.hoverPoint || this.state.pinnedPoint;
    this.temperatureGraph.graphTitleLabel.text(
      activePoint
        ? `${this.fourierMode ? 'Fourier' : 'Temperature'} at ${formatLatLon(pixelToLatLon(activePoint, this.state.width, this.state.height))}`
        : `${this.fourierMode ? 'Fourier' : 'Temperature'} at --`
    );
    if (this.fourierMode) {
      const amplitudes = this.graphDisplaySeries();
      const maxAmplitude = d3.max(amplitudes, (datum) => datum.value);
      this.temperatureGraph.currentPoint.attr('r', 0);
      this.temperatureGraph.currentMaskPoint.attr('r', 0);
      this.temperatureGraph.currentValueLabel.text(Number.isFinite(maxAmplitude) ? `Max ${formatTemperature(maxAmplitude)} °C` : 'Amplitude');
      return;
    }
    const series = this.hoverSeries || this.pinnedSeries;
    const datum = series ? series[this.state.displayFrameIndex] : null;
    const value = datum?.value;
    if (!Number.isFinite(value)) {
      this.temperatureGraph.currentPoint.attr('r', 0);
      this.temperatureGraph.currentMaskPoint.attr('r', 0);
      this.temperatureGraph.currentValueLabel.text('-- °C');
      return;
    }
    const x = this.temperatureGraph.xScale(this.state.displayFrameIndex);
    const y = this.temperatureGraph.yScale(clamp(value, DISPLAY_RANGE_MIN, DISPLAY_RANGE_MAX));
    this.temperatureGraph.currentPoint
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 5);
    this.temperatureGraph.currentMaskPoint
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', 5);
    this.temperatureGraph.currentValueLabel.text(`${formatTemperature(value)} °C`);
  }

  frameIndexFromGraphPointer(event) {
    if (!this.state.initialized || !this.temperatureGraph) {
      return null;
    }
    const rect = this.elements.temperatureGraph.getBoundingClientRect();
    if (!rect.width) {
      return null;
    }
    const x = ((event.clientX - rect.left) / rect.width) * this.temperatureGraph.width;
    return clamp(Math.round(this.temperatureGraph.xScale.invert(x)), 0, this.state.frameCount - 1);
  }

  emphasizeGraphTemperature(index, persist) {
    if (!this.paletteEmphasisBase && !this.elements.emphasisToggle.checked) {
      return;
    }
    const series = this.hoverSeries || this.pinnedSeries;
    const value = series?.[index]?.value;
    if (!Number.isFinite(value)) {
      return;
    }
    const position = clamp((value - DISPLAY_RANGE_MIN) / (DISPLAY_RANGE_MAX - DISPLAY_RANGE_MIN), 0, 1);
    if (persist) {
      this.paletteBasePosition = position;
      this.paletteEmphasisBase = true;
      this.elements.emphasisToggle.checked = true;
    }
    this.setPaletteEmphasisEnabled(true);
    this.setPaletteEmphasisPosition(position);
  }

  setPaletteEmphasisEnabled(enabled) {
    this.rendering.setEmphasisEnabled(enabled);
    this.updateEmphasisTemperatureTick();
  }

  setPaletteEmphasisPosition(position) {
    this.paletteEmphasisPosition = clamp(position, 0, 1);
    this.rendering.setPalettePosition(this.paletteEmphasisPosition);
    this.updateEmphasisTemperatureTick();
  }

  updateEmphasisTemperatureTick() {
    const { emphasisTemperatureTick, emphasisTemperatureValue, emphasisToggle } = this.elements;
    if (!emphasisTemperatureTick || !emphasisTemperatureValue) {
      return;
    }
    const enabled = Boolean(emphasisToggle.checked);
    emphasisTemperatureTick.hidden = !enabled;
    if (!enabled) {
      this.updateOverlappingScaleTicks(null);
      return;
    }
    const position = clamp(this.paletteEmphasisPosition, 0, 1);
    const temperature = DISPLAY_RANGE_MIN + position * (DISPLAY_RANGE_MAX - DISPLAY_RANGE_MIN);
    emphasisTemperatureTick.style.setProperty('--emphasis-position', `${position * 100}%`);
    emphasisTemperatureTick.dataset.edge = position < 0.08 ? 'start' : position > 0.92 ? 'end' : '';
    emphasisTemperatureValue.textContent = formatTemperature(temperature);
    this.updateOverlappingScaleTicks(temperature);
  }

  updateOverlappingScaleTicks(emphasisTemperature) {
    this.elements.stripScaleTicks?.forEach((tick) => {
      const tickTemperature = Number.parseFloat(tick.dataset.temperature);
      const overlaps = Number.isFinite(emphasisTemperature) &&
        Number.isFinite(tickTemperature) &&
        Math.abs(tickTemperature - emphasisTemperature) <= EMPHASIS_TICK_HIDE_THRESHOLD_C;
      tick.classList.toggle('is-hidden-for-emphasis', overlaps);
    });
  }

  frameIndexFromPointer(event) {
    if (!this.state.initialized || !this.timelineScale) {
      return null;
    }
    const [x] = d3.pointer(event, this.elements.frameTimeline);
    return clamp(Math.round(this.timelineScale.invert(x)), 0, this.state.frameCount - 1);
  }

  palettePositionFromPointer(event) {
    const rect = this.elements.stripCanvas.getBoundingClientRect();
    return rect.width ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : this.paletteBasePosition;
  }

  updateLabels() {
    this.elements.frameValueLabel.textContent = `${this.state.displayFrameIndex + 1} / ${this.state.frameCount}`;
    const date = dateForFrame(this.state.displayFrameIndex);
    this.elements.frameDateLabel.dateTime = date.toISOString().slice(0, 10);
    this.elements.frameDateLabel.textContent = formatDate(date);

  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readFps(slider, fallback) {
  const value = Number.parseInt(slider.value, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function bindSyncedNumberControl({ slider, input, decimals, beforeValue = null, onValue, signal }) {
  const handleValue = (source, fallback) => {
    const value = readControlValue(source, fallback);
    if (!Number.isFinite(value)) {
      return;
    }
    beforeValue?.();
    onValue(value);
  };
  slider.addEventListener('input', () => handleValue(slider, readControlValue(input, 0)), { signal });
  input.addEventListener('input', () => {
    if (input.value === '') {
      return;
    }
    handleValue(input, readControlValue(slider, 0));
  }, { signal });
  input.addEventListener('change', () => {
    input.value = readControlValue(input, readControlValue(slider, 0)).toFixed(decimals);
  }, { signal });
}

function readControlValue(control, fallback) {
  const value = Number.parseFloat(control.value);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const min = Number.parseFloat(control.min);
  const max = Number.parseFloat(control.max);
  return clamp(value, Number.isFinite(min) ? min : -Infinity, Number.isFinite(max) ? max : Infinity);
}

function isEditableKeyTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function formatTemperature(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

function formatAmplitudeTick(value) {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (value < 0.1) {
    return value.toFixed(2);
  }
  if (value < 10) {
    return value.toFixed(1);
  }
  return value.toFixed(0);
}

function renderFourierBars(group, series, xScale, yScale) {
  const baseline = yScale(yScale.domain()[0]);
  group.selectAll('line')
    .data(series)
    .join('line')
    .attr('x1', (datum) => xScale(datum.index))
    .attr('x2', (datum) => xScale(datum.index))
    .attr('y1', baseline)
    .attr('y2', (datum) => yScale(Math.max(yScale.domain()[0], datum.value)));
}

function pixelToLatLon(point, width, height) {
  const lon = ((point.x + 0.5) / Math.max(1, width)) * 360 - 180;
  const lat = 90 - ((point.y + 0.5) / Math.max(1, height)) * 180;
  return { lat, lon };
}

function formatLatLon({ lat, lon }) {
  const latSuffix = lat >= 0 ? 'N' : 'S';
  const lonSuffix = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${latSuffix}, ${Math.abs(lon).toFixed(1)}°${lonSuffix}`;
}

function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function createPointMarker(overlay, className) {
  const marker = overlay.append('g').attr('class', `point-marker ${className}`);
  marker.append('circle').attr('class', 'point-marker-ring point-marker-ring--black').attr('r', 8);
  marker.append('circle').attr('class', 'point-marker-ring point-marker-ring--white').attr('r', 8);
  return marker;
}

function setPointCircle(marker, point) {
  marker
    .classed('is-visible', Boolean(point))
    .attr('transform', point ? `translate(${point.x + 0.5},${point.y + 0.5})` : 'translate(0,0)');
}

function monthTickIndexes(frameCount) {
  const ticks = [];
  for (let month = 0; month < 12; month += 1) {
    const index = Math.round((Date.UTC(2019, month, 1) - START_DATE_UTC) / (24 * 60 * 60 * 1000));
    if (index >= 0 && index < frameCount) {
      ticks.push(index);
    }
  }
  return ticks;
}

function monthLabel(index) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(dateForFrame(index)).charAt(0);
}

function tickLength(index) {
  return index % 10 === 0 ? 16 : index % 5 === 0 ? 11 : 7;
}

function dateForFrame(index) {
  return new Date(START_DATE_UTC + index * 24 * 60 * 60 * 1000);
}

function formatDate(date) {
  return DATE_FORMATTER.format(date);
}
