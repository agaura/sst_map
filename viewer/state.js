export function createInitialState() {
  return {
    initialized: false,
    cube: null,
    width: 0,
    height: 0,
    frameCount: 0,
    selectedFrameIndex: 0,
    displayFrameIndex: 0,
    isPlaying: true,
    isTimelineHovered: false,
    pendingFrameRequestId: 0,
    hoverPoint: null,
    pinnedPoint: null,
  };
}
