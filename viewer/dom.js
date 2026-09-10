export function getDomElements() {
  return {
    imageCanvas: document.getElementById('image-canvas'),
    liveStatusCanvas: document.getElementById('live-status-canvas'),
    imageWrapper: document.getElementById('image-wrapper'),
    pointOverlay: document.getElementById('point-overlay'),
    temperatureGraph: document.getElementById('temperature-graph'),
    graphPaletteCanvas: document.getElementById('graph-palette-canvas'),
    signalAnalysisToggle: document.getElementById('signal-analysis-toggle'),
    signalAnalysisState: document.getElementById('signal-analysis-state'),
    signalAnalysisContent: document.getElementById('signal-analysis-content'),
    graphTemperatureToggle: document.getElementById('graph-temperature-toggle'),
    graphFourierToggle: document.getElementById('graph-fourier-toggle'),
    spaceCanvas: document.getElementById('space-canvas'),
    stripCanvas: document.getElementById('strip-canvas'),
    emphasisTemperatureTick: document.getElementById('emphasis-temperature-tick'),
    emphasisTemperatureValue: document.getElementById('emphasis-temperature-value'),
    stripScaleTicks: [...document.querySelectorAll('.strip-tick')],
    loadingOverlay: document.getElementById('loading'),
    frameTimeline: document.getElementById('frame-timeline'),
    frameValueLabel: document.getElementById('frame-value'),
    frameDateLabel: document.getElementById('frame-date'),
    playToggle: document.getElementById('play-toggle'),
    stepControls: document.getElementById('step-controls'),
    framePrevButton: document.getElementById('frame-prev'),
    frameNextButton: document.getElementById('frame-next'),
    fpsSlider: document.getElementById('fps-slider'),
    fpsValueLabel: document.getElementById('fps-value'),
    paletteSlider: document.getElementById('palette-slider'),
    paletteValueLabel: document.getElementById('palette-value'),
    edgeContrastControl: document.getElementById('edge-contrast-control'),
    edgeContrastToggle: document.getElementById('edge-contrast-toggle'),
    edgeContrastSlider: document.getElementById('edge-contrast-slider'),
    edgeContrastValueLabel: document.getElementById('edge-contrast-value'),
    hdrToggle: document.getElementById('hdr-toggle'),
    sphereToggle: document.getElementById('sphere-toggle'),
    emphasisToggle: document.getElementById('emphasis-toggle'),
    temperatureRange: document.getElementById('temperature-range'),
  };
}

export function showLoadingError(elements, message = 'Failed to load data') {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.textContent = message;
  }
}

export function hideLoadingOverlay(elements) {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.style.display = 'none';
  }
}
