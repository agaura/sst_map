// Work in CSS pixels so resizing the plot never stretches its labels or hit area.
export function graphLayout(rect, timeline) {
  const width = rect.width || 360, height = rect.height || 180;
  const margin = { left: Math.min(34, width * .17), right: 4, top: Math.min(22, height * .25), bottom: Math.min(28, height * .3) };
  const besideTimeline = rect.width > 0 && timeline?.height > 0 && rect.right <= timeline.left;
  if (besideTimeline) {
    const top = timeline.top - rect.top, bottom = rect.bottom - timeline.bottom;
    if (top >= 12 && bottom >= 0 && top + bottom < height - 12) {
      margin.top = top; margin.bottom = bottom;
    }
  }
  return { width, height, margin };
}
