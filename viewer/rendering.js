const COLOR_WGSL = /* wgsl */ `
fn encodeSRGBComponent(value: f32) -> f32 {
  return select(12.92 * value, 1.055 * pow(max(value, 0.0), 1.0 / 2.4) - 0.055, value > 0.0031308);
}

fn decodeSRGBComponent(value: f32) -> f32 {
  return select(value / 12.92, pow((value + 0.055) / 1.055, 2.4), value > 0.04045);
}

fn encodeSRGB(color: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    encodeSRGBComponent(color.r),
    encodeSRGBComponent(color.g),
    encodeSRGBComponent(color.b)
  );
}

fn decodeSRGB(color: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    decodeSRGBComponent(color.r),
    decodeSRGBComponent(color.g),
    decodeSRGBComponent(color.b)
  );
}

const LINEAR_SRGB_TO_LINEAR_P3 = mat3x3<f32>(
  0.82246210, 0.03319419, 0.01708263,
  0.17753790, 0.96680581, 0.07239744,
  0.00000000, 0.00000000, 0.91051993
);

const LINEAR_P3_TO_LINEAR_SRGB = mat3x3<f32>(
  1.22493997, -0.04205694, -0.01963755,
  -0.22493997, 1.04205694, -0.07863605,
  0.00000000, 0.00000000, 1.09827360
);

fn linearSRGBToOKLab(color: vec3<f32>) -> vec3<f32> {
  let l = 0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b;
  let m = 0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b;
  let s = 0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b;
  let root = sign(vec3<f32>(l, m, s)) * pow(abs(vec3<f32>(l, m, s)), vec3<f32>(1.0 / 3.0));
  return vec3<f32>(
    0.2104542553 * root.x + 0.7936177850 * root.y - 0.0040720468 * root.z,
    1.9779984951 * root.x - 2.4285922050 * root.y + 0.4505937099 * root.z,
    0.0259040371 * root.x + 0.7827717662 * root.y - 0.8086757660 * root.z
  );
}

fn linearSRGBToOKLab2(color: vec3<f32>) -> vec3<f32> {
  let l = 0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b;
  let m = 0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b;
  let s = 0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b;
  let root = sign(vec3<f32>(l, m, s)) * pow(abs(vec3<f32>(l, m, s)), vec3<f32>(1.0 / 3.0));
  let lab = vec3<f32>(
    0.2104542553 * root.x + 0.7936177850 * root.y - 0.0040720468 * root.z,
    1.9779984951 * root.x - 2.4285922050 * root.y + 0.4505937099 * root.z,
    0.0259040371 * root.x + 0.7827717662 * root.y - 0.8086757660 * root.z
  );
  let chroma = length(lab.yz);
  let chroma2 = sqrt(chroma) / 2.;
  let unit = select(vec2<f32>(0.0), lab.yz / chroma, chroma > 0.000001);
  return vec3<f32>(lab.x, chroma2 * unit);
}

fn p3ToOKLab(color: vec3<f32>) -> vec3<f32> {
  return linearSRGBToOKLab(LINEAR_P3_TO_LINEAR_SRGB * decodeSRGB(color));
}

fn linearP3ToOKLab(color: vec3<f32>) -> vec3<f32> {
  return linearSRGBToOKLab(LINEAR_P3_TO_LINEAR_SRGB * color);
}

fn oklabToP3(lab: vec3<f32>) -> vec3<f32> {
  return encodeSRGB(oklabToLinearP3(lab));
}

fn oklabToLinearP3(lab: vec3<f32>) -> vec3<f32> {
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  let lms = vec3<f32>(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  let linearSRGB = vec3<f32>(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
  );
  return LINEAR_SRGB_TO_LINEAR_P3 * linearSRGB;
}

fn oklab2ToLinearP3(lab2: vec3<f32>) -> vec3<f32> {
  let chroma2 = length(lab2.yz);
  let unscaledChroma2 = 2.0 * chroma2;
  let chroma = unscaledChroma2 * unscaledChroma2;
  let unit = select(vec2<f32>(0.0), lab2.yz / chroma2, chroma2 > 0.000001);
  let lab = vec3<f32>(lab2.x, chroma * unit);
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  let lms = vec3<f32>(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  let linearSRGB = vec3<f32>(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
  );
  return LINEAR_SRGB_TO_LINEAR_P3 * linearSRGB;
}

fn triangleWave(value: f32) -> f32 {
  return 2.0 * abs(2.0 * fract(value) - 1.0) - 1.0;
}

fn cosineWave(value: f32) -> f32 {
  return cos(6.2831853 * value);
}

fn forwardBoundaryDistance(value: f32, direction: f32, minimum: f32, maximum: f32) -> f32 {
  let big = 1.0e30;
  var distance = big;
  if (direction > 0.0) {
    distance = (maximum - value) / direction;
  } else if (direction < 0.0) {
    distance = (minimum - value) / direction;
  }
  return select(big, distance, distance > 0.0);
}

fn firstBoundaryHit(
  start: vec3<f32>,
  destination: vec3<f32>,
  minimum: vec3<f32>,
  maximum: vec3<f32>
) -> vec3<f32> {
  let direction = destination - start;
  let tx = forwardBoundaryDistance(start.x, direction.x, minimum.x, maximum.x);
  let ty = forwardBoundaryDistance(start.y, direction.y, minimum.y, maximum.y);
  let tz = forwardBoundaryDistance(start.z, direction.z, minimum.z, maximum.z);
  return clamp(start + direction * min(tx, min(ty, tz)), minimum, maximum);
}

fn colorMapIceCave(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.066;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.291, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.175;
  let chromaMid = 0.23;
  let chromaEnd = 0.26;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 4.6;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapGhost(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077 / 1.33;
  let chromaMid = 0.23 / 1.33;
  let chromaEnd = 0.16 / 1.33;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 5.;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapValentine(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045 * 3.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077;
  let chromaMid = 0.18;
  let chromaEnd = 0.12;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 0.468;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapSubmarine(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045 * 3.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077;
  let chromaMid = 0.1795;
  let chromaEnd = 0.12;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 4.68;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapAntarctica(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045 * 3.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 1.175 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077;
  let chromaMid = 0.21;
  let chromaEnd = 0.12;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 4.68;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapPolarHaunt(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045 * 3.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 1.175 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077;
  let chromaMid = 0.21;
  let chromaEnd = 0.12;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 5.0;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapArcticOcean(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.045 * 3.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 1.175 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.077;
  let chromaMid = 0.346;
  let chromaEnd = 0.125;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 5.0;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapBurgundyInferno(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = - 0.125;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.291, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.135;
  let chromaMid = 0.27;
  let chromaEnd = 0.4;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 6.;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapSandstorm(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - pow(t0, .5);
  let coverage = 0.17;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(1., 0.875 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.15;
  let chromaMid = 0.21;
  let chromaEnd = 0.33;
  let chromaMidT = 0.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 1.6;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapDusk(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.2;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.3, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.175;
  let chromaMid = 0.21;
  let chromaEnd = 0.139;
  let chromaMidT = 0.1;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 5.0;
  let angle = - pow(abs(t), 1.666) * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapX(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.25;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.3, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.16;
  let chromaAnchor1 = 0.235;
  let chromaAnchor1T = 0.22;
  let chromaAnchor2 = 0.24;
  let chromaAnchor2T = 0.33;
  let chromaEnd = 0.205;
  let oneMinusAnchor1T = 1.0 - chromaAnchor1T;
  let oneMinusAnchor2T = 1.0 - chromaAnchor2T;
  let anchor1Control1Weight = 3.0 * oneMinusAnchor1T * oneMinusAnchor1T * chromaAnchor1T;
  let anchor1Control2Weight = 3.0 * oneMinusAnchor1T * chromaAnchor1T * chromaAnchor1T;
  let anchor2Control1Weight = 3.0 * oneMinusAnchor2T * oneMinusAnchor2T * chromaAnchor2T;
  let anchor2Control2Weight = 3.0 * oneMinusAnchor2T * chromaAnchor2T * chromaAnchor2T;
  let anchor1Remainder = chromaAnchor1 - oneMinusAnchor1T * oneMinusAnchor1T * oneMinusAnchor1T * chromaStart - chromaAnchor1T * chromaAnchor1T * chromaAnchor1T * chromaEnd;
  let anchor2Remainder = chromaAnchor2 - oneMinusAnchor2T * oneMinusAnchor2T * oneMinusAnchor2T * chromaStart - chromaAnchor2T * chromaAnchor2T * chromaAnchor2T * chromaEnd;
  let controlDeterminant = anchor1Control1Weight * anchor2Control2Weight - anchor2Control1Weight * anchor1Control2Weight;
  let chromaControl1 = (anchor1Remainder * anchor2Control2Weight - anchor2Remainder * anchor1Control2Weight) / controlDeterminant;
  let chromaControl2 = (anchor1Control1Weight * anchor2Remainder - anchor2Control1Weight * anchor1Remainder) / controlDeterminant;
  let chroma = mix(
    mix(
      mix(chromaStart, chromaControl1, luminanceCycle),
      mix(chromaControl1, chromaControl2, luminanceCycle),
      luminanceCycle
    ),
    mix(
      mix(chromaControl1, chromaControl2, luminanceCycle),
      mix(chromaControl2, chromaEnd, luminanceCycle),
      luminanceCycle
    ),
    luminanceCycle
  );
  let angleOffset = 5.4;
  let angle = - pow(abs(t), 1.) * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapIntense(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.275;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.1;
  let chromaAnchor1 = 0.185;
  let chromaAnchor1T = 0.25;
  let chromaAnchor2 = 0.295;
  let chromaAnchor2T = 0.4;
  let chromaAnchor3 = 0.23;
  let chromaAnchor3T = 0.75;
  let chromaEnd = 0.213;
  let oneMinusAnchor1T = 1.0 - chromaAnchor1T;
  let oneMinusAnchor2T = 1.0 - chromaAnchor2T;
  let oneMinusAnchor3T = 1.0 - chromaAnchor3T;
  let anchor1Weights = vec3<f32>(
    4.0 * oneMinusAnchor1T * oneMinusAnchor1T * oneMinusAnchor1T * chromaAnchor1T,
    6.0 * oneMinusAnchor1T * oneMinusAnchor1T * chromaAnchor1T * chromaAnchor1T,
    4.0 * oneMinusAnchor1T * chromaAnchor1T * chromaAnchor1T * chromaAnchor1T
  );
  let anchor2Weights = vec3<f32>(
    4.0 * oneMinusAnchor2T * oneMinusAnchor2T * oneMinusAnchor2T * chromaAnchor2T,
    6.0 * oneMinusAnchor2T * oneMinusAnchor2T * chromaAnchor2T * chromaAnchor2T,
    4.0 * oneMinusAnchor2T * chromaAnchor2T * chromaAnchor2T * chromaAnchor2T
  );
  let anchor3Weights = vec3<f32>(
    4.0 * oneMinusAnchor3T * oneMinusAnchor3T * oneMinusAnchor3T * chromaAnchor3T,
    6.0 * oneMinusAnchor3T * oneMinusAnchor3T * chromaAnchor3T * chromaAnchor3T,
    4.0 * oneMinusAnchor3T * chromaAnchor3T * chromaAnchor3T * chromaAnchor3T
  );
  let anchorRemainders = vec3<f32>(
    chromaAnchor1 - oneMinusAnchor1T * oneMinusAnchor1T * oneMinusAnchor1T * oneMinusAnchor1T * chromaStart - chromaAnchor1T * chromaAnchor1T * chromaAnchor1T * chromaAnchor1T * chromaEnd,
    chromaAnchor2 - oneMinusAnchor2T * oneMinusAnchor2T * oneMinusAnchor2T * oneMinusAnchor2T * chromaStart - chromaAnchor2T * chromaAnchor2T * chromaAnchor2T * chromaAnchor2T * chromaEnd,
    chromaAnchor3 - oneMinusAnchor3T * oneMinusAnchor3T * oneMinusAnchor3T * oneMinusAnchor3T * chromaStart - chromaAnchor3T * chromaAnchor3T * chromaAnchor3T * chromaAnchor3T * chromaEnd
  );
  let controlWeight1 = vec3<f32>(anchor1Weights.x, anchor2Weights.x, anchor3Weights.x);
  let controlWeight2 = vec3<f32>(anchor1Weights.y, anchor2Weights.y, anchor3Weights.y);
  let controlWeight3 = vec3<f32>(anchor1Weights.z, anchor2Weights.z, anchor3Weights.z);
  let controlDeterminant = dot(controlWeight1, cross(controlWeight2, controlWeight3));
  let chromaControl1 = dot(anchorRemainders, cross(controlWeight2, controlWeight3)) / controlDeterminant;
  let chromaControl2 = dot(controlWeight1, cross(anchorRemainders, controlWeight3)) / controlDeterminant;
  let chromaControl3 = dot(controlWeight1, cross(controlWeight2, anchorRemainders)) / controlDeterminant;
  let chroma01 = mix(chromaStart, chromaControl1, luminanceCycle);
  let chroma12 = mix(chromaControl1, chromaControl2, luminanceCycle);
  let chroma23 = mix(chromaControl2, chromaControl3, luminanceCycle);
  let chroma34 = mix(chromaControl3, chromaEnd, luminanceCycle);
  let chroma012 = mix(chroma01, chroma12, luminanceCycle);
  let chroma123 = mix(chroma12, chroma23, luminanceCycle);
  let chroma234 = mix(chroma23, chroma34, luminanceCycle);
  let chroma = mix(
    mix(chroma012, chroma123, luminanceCycle),
    mix(chroma123, chroma234, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 5.6;
  let angle = - pow(abs(t), 1.) * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapFluorescent(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.275;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.1;
  let chromaAnchor1 = 0.138;
  let chromaAnchor1T = 0.10;
  let chromaAnchor2 = 0.19;
  let chromaAnchor2T = 0.20;
  let chromaAnchor3 = 0.237;
  let chromaAnchor3T = 0.30;
  let chromaAnchor4 = 0.293;
  let chromaAnchor4T = 0.40;
  let chromaAnchor5 = 0.315;
  let chromaAnchor5T = 0.50;
  let chromaAnchor6 = 0.305;
  let chromaAnchor6T = 0.55;
  let chromaAnchor7 = 0.28;
  let chromaAnchor7T = 0.65;
  let chromaAnchor8 = 0.24;
  let chromaAnchor8T = 0.75;
  let chromaAnchor9 = 0.22;
  let chromaAnchor9T = 0.85;
  let chromaAnchor10 = 0.215;
  let chromaAnchor10T = 0.93;
  let chromaEnd = 0.213;
  let chromaSegment1T = smoothstep(0.0, chromaAnchor1T, luminanceCycle);
  let chromaSegment2T = smoothstep(chromaAnchor1T, chromaAnchor2T, luminanceCycle);
  let chromaSegment3T = smoothstep(chromaAnchor2T, chromaAnchor3T, luminanceCycle);
  let chromaSegment4T = smoothstep(chromaAnchor3T, chromaAnchor4T, luminanceCycle);
  let chromaSegment5T = smoothstep(chromaAnchor4T, chromaAnchor5T, luminanceCycle);
  let chromaSegment6T = smoothstep(chromaAnchor5T, chromaAnchor6T, luminanceCycle);
  let chromaSegment7T = smoothstep(chromaAnchor6T, chromaAnchor7T, luminanceCycle);
  let chromaSegment8T = smoothstep(chromaAnchor7T, chromaAnchor8T, luminanceCycle);
  let chromaSegment9T = smoothstep(chromaAnchor8T, chromaAnchor9T, luminanceCycle);
  let chromaSegment10T = smoothstep(chromaAnchor9T, chromaAnchor10T, luminanceCycle);
  let chromaSegment11T = smoothstep(chromaAnchor10T, 1.0, luminanceCycle);
  var chroma = mix(chromaStart, chromaAnchor1, chromaSegment1T);
  chroma = select(chroma, mix(chromaAnchor1, chromaAnchor2, chromaSegment2T), luminanceCycle >= chromaAnchor1T);
  chroma = select(chroma, mix(chromaAnchor2, chromaAnchor3, chromaSegment3T), luminanceCycle >= chromaAnchor2T);
  chroma = select(chroma, mix(chromaAnchor3, chromaAnchor4, chromaSegment4T), luminanceCycle >= chromaAnchor3T);
  chroma = select(chroma, mix(chromaAnchor4, chromaAnchor5, chromaSegment5T), luminanceCycle >= chromaAnchor4T);
  chroma = select(chroma, mix(chromaAnchor5, chromaAnchor6, chromaSegment6T), luminanceCycle >= chromaAnchor5T);
  chroma = select(chroma, mix(chromaAnchor6, chromaAnchor7, chromaSegment7T), luminanceCycle >= chromaAnchor6T);
  chroma = select(chroma, mix(chromaAnchor7, chromaAnchor8, chromaSegment8T), luminanceCycle >= chromaAnchor7T);
  chroma = select(chroma, mix(chromaAnchor8, chromaAnchor9, chromaSegment9T), luminanceCycle >= chromaAnchor8T);
  chroma = select(chroma, mix(chromaAnchor9, chromaAnchor10, chromaSegment10T), luminanceCycle >= chromaAnchor9T);
  chroma = select(chroma, mix(chromaAnchor10, chromaEnd, chromaSegment11T), luminanceCycle >= chromaAnchor10T);
  let angleOffset = 5.6;
  let angle = - pow(abs(t), 1.) * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapMidnight(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 0.;
  let luminanceCoverage = 0.5;
  let luminanceCycle = mix((cosineWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, (triangleWave(luminanceCoverage * t + 1.5) + 1.0) * 0.5, 1.);
  let lightness = mix(0.2, 0.975 + 0.10 * t, luminanceCycle);
  let chromaStart = 0.062;
  let chromaMid = 0.6;
  let chromaEnd = 0.56;
  let chromaMidT = 3.5;
  let oneMinusChromaMidT = 1.0 - chromaMidT;
  let chromaControl = (
    chromaMid -
    oneMinusChromaMidT * oneMinusChromaMidT * chromaStart -
    chromaMidT * chromaMidT * chromaEnd
  ) / (2.0 * oneMinusChromaMidT * chromaMidT);
  let chroma = mix(
    mix(chromaStart, chromaControl, luminanceCycle),
    mix(chromaControl, chromaEnd, luminanceCycle),
    luminanceCycle
  );
  let angleOffset = 4.6;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let minimumHdrLightness = 0.25;
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(8.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapFlatRainbow(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 1.;
  let luminanceCycle = 0.;
  let lightness = 0.9;
  let chromaThickness = 0.3;
  let chroma = 0.205;
  let angleOffset = 5.5;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapExperimentalRainbow(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = custom;
  let luminanceCycle = 0.;
  let lightness = 0.9;
  let chromaPosition = clamp(t0, 0.0, 1.0);
  let chromaCycleCount = max(abs(coverage), 1.0);
  let chromaCycle = select(chromaPosition, fract(chromaPosition * chromaCycleCount), chromaCycleCount > 1.0);
  let chromaStart = 0.3;
  let chromaAnchor1 = 0.3;
  let chromaAnchor1T = 0.10;
  let chromaAnchor2 = 0.237;
  let chromaAnchor2T = 0.20;
  let chromaAnchor3 = 0.205;
  let chromaAnchor3T = 0.30;
  let chromaAnchor4 = 0.205;
  let chromaAnchor4T = 0.40;
  let chromaAnchor5 = 0.23;
  let chromaAnchor5T = 0.50;
  let chromaAnchor6 = 0.205;
  let chromaAnchor6T = 0.55;
  let chromaAnchor7 = 0.205;
  let chromaAnchor7T = 0.65;
  let chromaAnchor8 = 0.215;
  let chromaAnchor8T = 0.75;
  let chromaAnchor9 = 0.25;
  let chromaAnchor9T = 0.85;
  let chromaAnchor10 = 0.28;
  let chromaAnchor10T = 0.93;
  let chromaEnd = 0.3;
  let chromaSegment1T = smoothstep(0.0, chromaAnchor1T, chromaCycle);
  let chromaSegment2T = smoothstep(chromaAnchor1T, chromaAnchor2T, chromaCycle);
  let chromaSegment3T = smoothstep(chromaAnchor2T, chromaAnchor3T, chromaCycle);
  let chromaSegment4T = smoothstep(chromaAnchor3T, chromaAnchor4T, chromaCycle);
  let chromaSegment5T = smoothstep(chromaAnchor4T, chromaAnchor5T, chromaCycle);
  let chromaSegment6T = smoothstep(chromaAnchor5T, chromaAnchor6T, chromaCycle);
  let chromaSegment7T = smoothstep(chromaAnchor6T, chromaAnchor7T, chromaCycle);
  let chromaSegment8T = smoothstep(chromaAnchor7T, chromaAnchor8T, chromaCycle);
  let chromaSegment9T = smoothstep(chromaAnchor8T, chromaAnchor9T, chromaCycle);
  let chromaSegment10T = smoothstep(chromaAnchor9T, chromaAnchor10T, chromaCycle);
  let chromaSegment11T = smoothstep(chromaAnchor10T, 1.0, chromaCycle);
  var chroma = mix(chromaStart, chromaAnchor1, chromaSegment1T);
  chroma = select(chroma, mix(chromaAnchor1, chromaAnchor2, chromaSegment2T), chromaCycle >= chromaAnchor1T);
  chroma = select(chroma, mix(chromaAnchor2, chromaAnchor3, chromaSegment3T), chromaCycle >= chromaAnchor2T);
  chroma = select(chroma, mix(chromaAnchor3, chromaAnchor4, chromaSegment4T), chromaCycle >= chromaAnchor3T);
  chroma = select(chroma, mix(chromaAnchor4, chromaAnchor5, chromaSegment5T), chromaCycle >= chromaAnchor4T);
  chroma = select(chroma, mix(chromaAnchor5, chromaAnchor6, chromaSegment6T), chromaCycle >= chromaAnchor5T);
  chroma = select(chroma, mix(chromaAnchor6, chromaAnchor7, chromaSegment7T), chromaCycle >= chromaAnchor6T);
  chroma = select(chroma, mix(chromaAnchor7, chromaAnchor8, chromaSegment8T), chromaCycle >= chromaAnchor7T);
  chroma = select(chroma, mix(chromaAnchor8, chromaAnchor9, chromaSegment9T), chromaCycle >= chromaAnchor8T);
  chroma = select(chroma, mix(chromaAnchor9, chromaAnchor10, chromaSegment10T), chromaCycle >= chromaAnchor9T);
  chroma = select(chroma, mix(chromaAnchor10, chromaEnd, chromaSegment11T), chromaCycle >= chromaAnchor10T);
  let angleOffset = 5.5;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapMixture(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = (triangleWave(t0 * 5.) + 1.) / 2.;
  let lightness = 0.5;
  let chroma1 = 0.3;
  let chroma2 = 0.19;
  let angle1 = 0.9 * 6.28;
  let angle2 = 0.7 * 6.28;
  let c1 = vec3<f32>(lightness, 0., chroma1 * sin(angle1));
  let c2 = vec3<f32>(lightness, chroma2 * cos(angle2), chroma2 * sin(angle2));
  var c1p3 = oklabToLinearP3(c1);
  c1p3 = vec3(custom);
  var c2p3 = oklabToLinearP3(c2);
  c2p3 = vec3(1., 0., 0.);
  //c2p3 = vec3(custom * 4., custom * 2., 0.0001);
  var lab = linearP3ToOKLab(mix(c1p3, c2p3, t));

  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMapTropicalFire(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 1.;
  let luminanceCycle = mix((cosineWave((1.0) * t * coverage + 1.5) + 1.0) * 0.5, (triangleWave((1.0) * t * coverage + 1.5) + 1.0) * 0.5, 0.25);
  let lightness = mix(0.19, 1.1 + 0.10 * ((t * coverage) % 1.), luminanceCycle);
  //let chroma = mix(0.025, 0.21, luminanceCycle);
  let chromaThickness = 0.3;
  let chroma = pow(mix(pow(0.1, chromaThickness), pow(0.2259, chromaThickness), luminanceCycle), 1. / chromaThickness);
  let angleOffset = 5.5;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let threshold = 0.;
  if (t0 > threshold) {
    let tRescale = (t0 - threshold) / (1. - threshold);
    let temp = oklabToLinearP3(lab);
    let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
    let tempY = dot(temp, Yvec);
    let red = vec3(1., 0., 0.);
    let redY = dot(red, Yvec);
    let oklabRed = linearP3ToOKLab(red * (tempY/redY * (1.)));
    lab = mix(lab, oklabRed, mix(pow(tRescale, 2.0), pow(tRescale, 0.5), tRescale));
  }
  if (t0 > threshold) {
    let tRescale = (t0 - threshold) / (1. - threshold);
    let temp = oklabToLinearP3(lab);
    let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
    let tempY = dot(temp, Yvec);
    let red = vec3(temp.r, temp.g, 0.001);
    let redY = dot(red, Yvec);
    let oklabRed = linearP3ToOKLab(red * (tempY/redY * (1.)));
    lab = mix(lab, oklabRed, clamp(0., 1.0, (t0 - threshold) * 4.));
  }
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn colorMap(t0: f32, selected: f32, custom: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let t = - t0;
  let coverage = 1.;
  let luminanceCycle = mix((cosineWave((1.0) * t * coverage + 1.5) + 1.0) * 0.5, (triangleWave((1.0) * t * coverage + 1.5) + 1.0) * 0.5, 0.25);
  let lightness = mix(0.19, 1.1 + 0.10 * ((t * coverage) % 1.), luminanceCycle);
  //let chroma = mix(0.025, 0.21, luminanceCycle);
  let chromaThickness = 0.3;
  let chroma = pow(mix(pow(0.1, chromaThickness), pow(0.2259, chromaThickness), luminanceCycle), 1. / chromaThickness);
  let angleOffset = 5.5;
  let angle = t * 6.2831853 * coverage + angleOffset;
  var lab = vec3<f32>(lightness, chroma * cos(angle), chroma * sin(angle));
  let threshold = 0.5;
  let thresh0 = 0.15;
  let thresh1 = 0.35;
  // if (t0 < thresh0) {
  //   let tRescale = t0 / thresh0;
  //   let temp = oklabToLinearP3(lab);
  //   let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
  //   let tempY = dot(temp, Yvec);
  //   let blue = vec3(0., 0.15, 1.);
  //   let blueY = dot(blue, Yvec);
  //   lab = linearP3ToOKLab(mix(temp, blue * (tempY/blueY * (1.)), tRescale));
  // }
  // else {
  //   if (t0 < thresh1) {
  //     let tRescale = 1.0 - (t0 - thresh0) / (thresh1 - thresh0);
  //     let temp = oklabToLinearP3(lab);
  //     let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
  //     let tempY = dot(temp, Yvec);
  //     let blue = vec3(0., 0.15, 1.);
  //     let blueY = dot(blue, Yvec);
  //     lab = linearP3ToOKLab(mix(temp, blue * (tempY/blueY * (1.)), mix(pow(tRescale, 2.), pow(tRescale, .5), tRescale)));
  //   }
  //   if (t0 < thresh1) {
  //     let tRescale = 1.0 - (t0 - thresh0) / (thresh1 - thresh0);
  //     let temp = oklabToLinearP3(lab);
  //     let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
  //     let tempY = dot(temp, Yvec);
  //     let blue = vec3(0.001, temp.g, temp.b);
  //     let blueY = dot(blue, Yvec);
  //     let oklabBlue = linearP3ToOKLab(blue * (tempY/blueY * (1.)));
  //     lab = linearP3ToOKLab(mix(temp, blue * (tempY/blueY * (1.)), clamp(0., 1.0, tRescale * 4.)));
  //   }
  // }
  if (t0 > threshold) {
    let tRescale = (t0 - threshold) / (1. - threshold);
    let temp = oklabToLinearP3(lab);
    let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
    let tempY = dot(temp, Yvec);
    let red = vec3(1., 0., 0.);
    let redY = dot(red, Yvec);
    let oklabRed = linearP3ToOKLab(red * (tempY/redY * (1.)));
    lab = mix(lab, oklabRed, mix(pow(tRescale, 2.0), pow(tRescale, 0.5), tRescale));
  }
  if (t0 > threshold) {
    let tRescale = (t0 - threshold) / (1. - threshold);
    let temp = oklabToLinearP3(lab);
    let Yvec = vec3(0.22897456, 0.69173852, 0.07928691);
    let tempY = dot(temp, Yvec);
    let red = vec3(temp.r, temp.g, 0.001);
    let redY = dot(red, Yvec);
    let oklabRed = linearP3ToOKLab(red * (tempY/redY * (1.)));
    lab = mix(lab, oklabRed, clamp(0., 1.0, (t0 - threshold) * 4.));
  }
  let dist = abs(clamp(selected, 0.0, 1.0) - t0);
  let emphasis = pow(max(0.0, 1.0 - dist / 0.125), 2.);
  let potentialMax = oklabToLinearP3(lab);
  let neutral = oklabToLinearP3(vec3<f32>(lab.x, 0.0, 0.0));
  let hdrFactor = hdrScale;
  let boundary = firstBoundaryHit(neutral, potentialMax, vec3<f32>(0.0), vec3<f32>(4.));
  let peak = max(boundary.x, max(boundary.y, boundary.z));
  let saturatedBoundaryP3 = hdrFactor * boundary / max(peak, 0.000001);
  var saturatedP3 = mix(neutral, saturatedBoundaryP3, 0.999);
  let saturatedY = dot(saturatedP3, vec3<f32>(0.22897456, 0.69173852, 0.07928691));
  let scale = clamp(2. / saturatedY, 1.25, 1.75);
  saturatedP3 *= scale;
  let saturated = select(lab, linearP3ToOKLab(saturatedP3), emphasisEnabled);

  return mix(lab, saturated, emphasis);
}

fn paletteColor(t: f32, selected: f32, hueOffset: f32, hdrScale: f32, emphasisEnabled: bool) -> vec3<f32> {
  let hdrFactor = hdrScale;
  let p3 = oklabToP3(colorMap(clamp(t, 0.0, 1.0), selected, hueOffset, hdrScale, emphasisEnabled));
  if (min(min(p3.x, p3.y), p3.z) < 0.) {
    return vec3<f32>(0., 0., 0.);
  }
  if (max(max(p3.x, p3.y), p3.z) > 2. * hdrFactor) {
    return vec3<f32>(0., 0., 0.);
  }

  if (t == 0.) {
    return vec3<f32>(0.);
  }

  return max(p3, vec3<f32>(0.0));
}
`;

const FULL_SCREEN_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn fullScreenVertex(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let position = positions[index];
  var out: VertexOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = position * 0.5 + vec2<f32>(0.5);
  return out;
}
`;

const DISPLAY_RANGE_MIN = -2;
const DISPLAY_RANGE_MAX = 36;

export async function createRenderingContext(elements) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new Error('No WebGPU adapter is available.');
  }
  const device = await adapter.requestDevice();
  const contexts = createContexts(elements);
  const presentation = configureContexts(device, contexts);
  const { format, toneMappingMode } = presentation;
  const visuals = {
    min: DISPLAY_RANGE_MIN,
    max: DISPLAY_RANGE_MAX,
    hue: Number.parseFloat(elements.paletteSlider.value),
    edgeContrast: elements.edgeContrastToggle?.checked ? Number.parseFloat(elements.edgeContrastSlider.value) : 0,
    hdr: elements.hdrToggle.checked ? 2 : 1,
    spherical: elements.sphereToggle.checked,
    cloudAutoRotate: true,
    emphasis: elements.emphasisToggle.checked,
    selected: 0.5,
    time: 0,
  };

  const lifetime = new AbortController();
  document.getElementById('cloud-auto-rotate-toggle')?.addEventListener('change', (event) => {
    visuals.cloudAutoRotate = event.target.checked;
  }, { signal: lifetime.signal });
  const image = createImageRenderer(device, contexts.image, format, visuals, lifetime.signal);
  const strip = createStripRenderer(device, contexts.strip, format, visuals);
  const graphPalette = contexts.graphPalette ? createGraphPaletteRenderer(device, contexts.graphPalette, format, visuals) : null;
  const cloud = createPointCloudRenderer(device, contexts.space, elements.spaceCanvas, format, visuals, lifetime.signal);
  const status = createHdrStatusRenderer(device, [contexts.liveStatus].filter(Boolean));

  const dirty = new Set(['image', 'strip', 'graph', 'status']);
  const stats = { image: 0, strip: 0, graph: 0, cloud: 0, status: 0 };
  const canvases = { image: elements.imageCanvas, strip: elements.stripCanvas, graph: elements.graphPaletteCanvas, cloud: elements.spaceCanvas, status: elements.liveStatusCanvas };
  const visible = new Map(Object.entries(canvases).map(([name, canvas]) => [name, Boolean(canvas?.clientWidth && canvas?.clientHeight)]));
  let frameHandle = null, resizePending = true, destroyed = false, statusColor = null;
  function schedule() {
    if (!destroyed && !document.hidden && frameHandle === null) frameHandle = window.requestAnimationFrame(animate);
  }
  function invalidate(...names) { names.forEach(name => dirty.add(name)); schedule(); }
  function requestResize() { resizePending = true; schedule(); }
  function resizeAuxiliaryCanvases() {
    for (const [name, canvas, context] of [
      ['cloud', elements.spaceCanvas, contexts.space],
      ['strip', elements.stripCanvas, contexts.strip],
      ['graph', elements.graphPaletteCanvas, contexts.graphPalette],
      ['status', elements.liveStatusCanvas, contexts.liveStatus],
    ]) {
      if (!canvas || !canvas.clientWidth || !canvas.clientHeight) { visible.set(name, false); continue; }
      const rect = canvas.getBoundingClientRect();
      visible.set(name, rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth);
      if (resizeCanvasToDisplaySize(canvas, context, device, format, toneMappingMode)) {
        if (name === 'cloud') cloud.resizeDepthTexture(); else dirty.add(name);
      }
    }
  }
  function setSize(width, height) {
    elements.imageCanvas.width = width; elements.imageCanvas.height = height;
    elements.imageWrapper.style.setProperty('--image-width', String(width));
    elements.imageWrapper.style.setProperty('--image-height', String(height));
    configureContext(contexts.image, device, format, toneMappingMode);
    image.setDimensions(width, height); requestResize(); invalidate('image');
  }
  function setFrame(frame, width, height) {
    image.setFrame(frame.data, width, height); invalidate('image');
  }
  function change(name, value, ...targets) {
    if (visuals[name] === value) return;
    visuals[name] = value; invalidate(...targets);
  }
  const setPalette = hue => change('hue', hue, 'image', 'strip', 'graph');
  const setEdgeContrast = value => change('edgeContrast', value, 'image');
  const setHdrEnabled = enabled => change('hdr', enabled ? 2 : 1, 'image', 'strip', 'graph');
  const setSphericalViewEnabled = enabled => change('spherical', enabled, 'image');
  const setEmphasisEnabled = enabled => change('emphasis', enabled, 'image', 'strip', 'graph');
  const setPalettePosition = position => change('selected', position, 'image', 'strip', 'graph');
  const resizeObserver = new ResizeObserver(requestResize);
  Object.values(canvases).filter(Boolean).forEach(canvas => resizeObserver.observe(canvas));
  const intersectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const name = Object.keys(canvases).find(key => canvases[key] === entry.target);
      visible.set(name, entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0);
      if (visible.get(name)) invalidate(name);
    }
    schedule();
  });
  Object.values(canvases).filter(Boolean).forEach(canvas => intersectionObserver.observe(canvas));
  // Graph visibility also changes when switching between temperature and Fourier.
  const mutationObserver = new MutationObserver(requestResize);
  mutationObserver.observe(elements.signalAnalysisContent, { attributes: true, attributeFilter: ['hidden'] });
  mutationObserver.observe(elements.temperatureGraph, { attributes: true, attributeFilter: ['class'] });
  const visibilityChange = () => {
    if (document.hidden) { window.cancelAnimationFrame(frameHandle); frameHandle = null; }
    else { requestResize(); invalidate('image', 'strip', 'graph', 'status'); }
  };
  document.addEventListener('visibilitychange', visibilityChange);
  function animate(time) {
    frameHandle = null;
    if (destroyed || document.hidden) return;
    if (resizePending) { resizePending = false; resizeAuxiliaryCanvases(); }
    visuals.time = time * 0.001;
    const renderers = { image, strip, graph: graphPalette, status };
    for (const name of Object.keys(renderers)) {
      if (!visible.get(name) || !renderers[name]) continue;
      if (dirty.has(name) || (name === 'image' && visuals.spherical)) {
        if (name === 'status' && statusColor) { status.setColor(...statusColor); statusColor = null; }
        else renderers[name].render();
        stats[name]++; dirty.delete(name);
      }
    }
    if (visible.get('cloud')) { cloud.render(); stats.cloud++; }
    if (visible.get('cloud') || (visuals.spherical && visible.get('image'))) schedule();
  }
  schedule();
  return {
    setSize, setFrame, setPalette, setEdgeContrast, setHdrEnabled,
    setSphericalViewEnabled, setEmphasisEnabled, setPalettePosition,
    setLiveStatusColor(r, g, b) { statusColor = [r, g, b]; invalidate('status'); },
    render: () => invalidate('image'),
    getStats: () => ({ ...stats }),
    destroy() {
      destroyed = true; lifetime.abort(); window.cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect(); intersectionObserver.disconnect(); mutationObserver.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      Object.values(contexts).forEach(context => context.unconfigure());
      device.destroy();
    },
  };
}

function createContexts(elements) {
  const entries = {
    image: elements.imageCanvas,
    strip: elements.stripCanvas,
    space: elements.spaceCanvas,
  };
  if (elements.graphPaletteCanvas) {
    entries.graphPalette = elements.graphPaletteCanvas;
  }
  if (elements.liveStatusCanvas) {
    entries.liveStatus = elements.liveStatusCanvas;
  }
  return Object.fromEntries(Object.entries(entries).map(([name, canvas]) => {
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error(`WebGPU canvas context unavailable for ${name}.`);
    }
    return [name, context];
  }));
}

function configureContexts(device, contexts) {
  const candidates = ['rgba16float', navigator.gpu.getPreferredCanvasFormat()];
  for (const format of candidates) {
    if (!format) {
      continue;
    }
    for (const toneMappingMode of ['extended', 'standard']) {
      try {
        Object.values(contexts).forEach((context) => configureContext(context, device, format, toneMappingMode));
        return { format, toneMappingMode };
      } catch (error) {
        console.warn(`Unable to configure WebGPU canvases as ${format} with ${toneMappingMode} tone mapping.`, error);
      }
    }
  }
  throw new Error('Unable to configure WebGPU canvas formats.');
}

function configureContext(context, device, format, toneMappingMode) {
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
    colorSpace: 'display-p3',
    toneMapping: { mode: toneMappingMode },
  });
}

function resizeCanvasToDisplaySize(canvas, context, device, format, toneMappingMode) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width === width && canvas.height === height) {
    return false;
  }
  canvas.width = width;
  canvas.height = height;
  configureContext(context, device, format, toneMappingMode);
  return true;
}

function createHdrStatusRenderer(device, contexts) {
  const color = { r: 4, g: 4, b: 0, a: 1 };

  function render() {
    if (!contexts.length) {
      return;
    }
    const encoder = device.createCommandEncoder();
    contexts.forEach((context) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: color,
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.end();
    });
    device.queue.submit([encoder.finish()]);
  }

  function setColor(r, g, b) {
    color.r = r;
    color.g = g;
    color.b = b;
    render();
  }

  return { render, setColor };
}

function createImageRenderer(device, context, format, visuals, signal) {
  const module = device.createShaderModule({
    code: `${COLOR_WGSL}
${FULL_SCREEN_WGSL}
struct ImageUniforms {
  params0: vec4<f32>,
  params1: vec4<f32>,
  params2: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: ImageUniforms;
@group(0) @binding(1) var<storage, read> values: array<f32>;

fn normalizedValueAt(pixelX: i32, pixelY: i32, width: u32, height: u32, span: f32) -> f32 {
  let x = u32(clamp(pixelX, 0, i32(width) - 1));
  let y = u32(clamp(pixelY, 0, i32(height) - 1));
  let value = values[y * width + x];
  if (value != value) {
    return 0.0;
  }
  return clamp((value - uniforms.params0.x) / span, 0.0, 1.0);
}

fn isZeroPaletteValue(pixelX: i32, pixelY: i32, width: u32, height: u32, span: f32) -> bool {
  return normalizedValueAt(pixelX, pixelY, width, height, span) == 0.0;
}

fn sobelMagnitude(x: u32, y: u32, width: u32, height: u32, span: f32) -> f32 {
  let px = i32(x);
  let py = i32(y);
  let hasZeroPaletteNeighbor =
    isZeroPaletteValue(px - 1, py - 1, width, height, span) ||
    isZeroPaletteValue(px, py - 1, width, height, span) ||
    isZeroPaletteValue(px + 1, py - 1, width, height, span) ||
    isZeroPaletteValue(px - 1, py, width, height, span) ||
    isZeroPaletteValue(px, py, width, height, span) ||
    isZeroPaletteValue(px + 1, py, width, height, span) ||
    isZeroPaletteValue(px - 1, py + 1, width, height, span) ||
    isZeroPaletteValue(px, py + 1, width, height, span) ||
    isZeroPaletteValue(px + 1, py + 1, width, height, span);
  if (hasZeroPaletteNeighbor) {
    return 0.0;
  }
  let tl = normalizedValueAt(px - 1, py - 1, width, height, span);
  let tc = normalizedValueAt(px, py - 1, width, height, span);
  let tr = normalizedValueAt(px + 1, py - 1, width, height, span);
  let ml = normalizedValueAt(px - 1, py, width, height, span);
  let mr = normalizedValueAt(px + 1, py, width, height, span);
  let bl = normalizedValueAt(px - 1, py + 1, width, height, span);
  let bc = normalizedValueAt(px, py + 1, width, height, span);
  let br = normalizedValueAt(px + 1, py + 1, width, height, span);
  let gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2<f32>(gx, gy));
}

fn sobelMagnitude2(x: u32, y: u32, width: u32, height: u32, span: f32) -> f32 {
  let px = i32(x);
  let py = i32(y);
  let hasZeroPaletteNeighbor =
    isZeroPaletteValue(px - 2, py - 2, width, height, span) ||
    isZeroPaletteValue(px - 1, py - 2, width, height, span) ||
    isZeroPaletteValue(px, py - 2, width, height, span) ||
    isZeroPaletteValue(px + 1, py - 2, width, height, span) ||
    isZeroPaletteValue(px + 2, py - 2, width, height, span) ||
    isZeroPaletteValue(px - 2, py - 1, width, height, span) ||
    isZeroPaletteValue(px - 1, py - 1, width, height, span) ||
    isZeroPaletteValue(px, py - 1, width, height, span) ||
    isZeroPaletteValue(px + 1, py - 1, width, height, span) ||
    isZeroPaletteValue(px + 2, py - 1, width, height, span) ||
    isZeroPaletteValue(px - 2, py, width, height, span) ||
    isZeroPaletteValue(px - 1, py, width, height, span) ||
    isZeroPaletteValue(px, py, width, height, span) ||
    isZeroPaletteValue(px + 1, py, width, height, span) ||
    isZeroPaletteValue(px + 2, py, width, height, span) ||
    isZeroPaletteValue(px - 2, py + 1, width, height, span) ||
    isZeroPaletteValue(px - 1, py + 1, width, height, span) ||
    isZeroPaletteValue(px, py + 1, width, height, span) ||
    isZeroPaletteValue(px + 1, py + 1, width, height, span) ||
    isZeroPaletteValue(px + 2, py + 1, width, height, span) ||
    isZeroPaletteValue(px - 2, py + 2, width, height, span) ||
    isZeroPaletteValue(px - 1, py + 2, width, height, span) ||
    isZeroPaletteValue(px, py + 2, width, height, span) ||
    isZeroPaletteValue(px + 1, py + 2, width, height, span) ||
    isZeroPaletteValue(px + 2, py + 2, width, height, span);
  if (hasZeroPaletteNeighbor) {
    return 0.0;
  }

  let v00 = normalizedValueAt(px - 2, py - 2, width, height, span);
  let v10 = normalizedValueAt(px - 1, py - 2, width, height, span);
  let v20 = normalizedValueAt(px, py - 2, width, height, span);
  let v30 = normalizedValueAt(px + 1, py - 2, width, height, span);
  let v40 = normalizedValueAt(px + 2, py - 2, width, height, span);
  let v01 = normalizedValueAt(px - 2, py - 1, width, height, span);
  let v11 = normalizedValueAt(px - 1, py - 1, width, height, span);
  let v21 = normalizedValueAt(px, py - 1, width, height, span);
  let v31 = normalizedValueAt(px + 1, py - 1, width, height, span);
  let v41 = normalizedValueAt(px + 2, py - 1, width, height, span);
  let v02 = normalizedValueAt(px - 2, py, width, height, span);
  let v12 = normalizedValueAt(px - 1, py, width, height, span);
  let v32 = normalizedValueAt(px + 1, py, width, height, span);
  let v42 = normalizedValueAt(px + 2, py, width, height, span);
  let v03 = normalizedValueAt(px - 2, py + 1, width, height, span);
  let v13 = normalizedValueAt(px - 1, py + 1, width, height, span);
  let v23 = normalizedValueAt(px, py + 1, width, height, span);
  let v33 = normalizedValueAt(px + 1, py + 1, width, height, span);
  let v43 = normalizedValueAt(px + 2, py + 1, width, height, span);
  let v04 = normalizedValueAt(px - 2, py + 2, width, height, span);
  let v14 = normalizedValueAt(px - 1, py + 2, width, height, span);
  let v24 = normalizedValueAt(px, py + 2, width, height, span);
  let v34 = normalizedValueAt(px + 1, py + 2, width, height, span);
  let v44 = normalizedValueAt(px + 2, py + 2, width, height, span);

  let gx =
    (-1.0 * v00 - 2.0 * v10 + 2.0 * v30 + 1.0 * v40) * 1.0 +
    (-1.0 * v01 - 2.0 * v11 + 2.0 * v31 + 1.0 * v41) * 4.0 +
    (-1.0 * v02 - 2.0 * v12 + 2.0 * v32 + 1.0 * v42) * 6.0 +
    (-1.0 * v03 - 2.0 * v13 + 2.0 * v33 + 1.0 * v43) * 4.0 +
    (-1.0 * v04 - 2.0 * v14 + 2.0 * v34 + 1.0 * v44) * 1.0;
  let gy =
    (-1.0 * v00 - 2.0 * v01 + 2.0 * v03 + 1.0 * v04) * 1.0 +
    (-1.0 * v10 - 2.0 * v11 + 2.0 * v13 + 1.0 * v14) * 4.0 +
    (-1.0 * v20 - 2.0 * v21 + 2.0 * v23 + 1.0 * v24) * 6.0 +
    (-1.0 * v30 - 2.0 * v31 + 2.0 * v33 + 1.0 * v34) * 4.0 +
    (-1.0 * v40 - 2.0 * v41 + 2.0 * v43 + 1.0 * v44) * 1.0;
  return length(vec2<f32>(gx, gy)) / 128.0;
}

@fragment
fn imageFragment(in: VertexOut) -> @location(0) vec4<f32> {
  let width = u32(uniforms.params1.y);
  let height = u32(uniforms.params1.z);
  let x = min(u32(in.position.x), width - 1u);
  let y = min(u32(in.position.y), height - 1u);
  let value = values[y * width + x];
  if (value != value) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  let span = max(uniforms.params0.y - uniforms.params0.x, 0.000001);
  let normalized = clamp((value - uniforms.params0.x) / span, 0.0, 1.0);
  let edge = sobelMagnitude(x, y, width, height, span);
  let linearColor = decodeSRGB(paletteColor(normalized, uniforms.params1.x, uniforms.params0.z, uniforms.params0.w, uniforms.params1.w > 0.5));
  var scale = mix(1., clamp(mix(1., 6., pow(edge, 0.7)) - 0.6, 0.5, 4.), uniforms.params2.x);
  let maxLinearColor = max(max(linearColor.x, linearColor.y), linearColor.z);
  scale = min(scale, decodeSRGBComponent(3.95) / max(maxLinearColor, 0.000001));
  var color = encodeSRGB(scale * linearColor);
  let hdrFactor = uniforms.params0.w;
  var hdr = 1.;
  if (hdrFactor > 1.) {
    hdr = 4.;
  }
  if (max(max(color.x, color.y), color.z) > hdr) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  return vec4<f32>(color, 1.0);
}`,
  });
  const sphereModule = device.createShaderModule({
    code: `${COLOR_WGSL}
struct SphereUniforms {
  mvp: mat4x4<f32>,
  params0: vec4<f32>,
  params1: vec4<f32>,
  params2: vec4<f32>,
};
@group(0) @binding(0) var<uniform> sphereUniforms: SphereUniforms;
@group(0) @binding(1) var<storage, read> sphereValues: array<f32>;

struct SphereOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn sphereVertex(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> SphereOut {
  var out: SphereOut;
  out.position = sphereUniforms.mvp * vec4<f32>(position, 1.0);
  out.uv = uv;
  return out;
}

fn sphereNormalizedValueAt(pixelX: i32, pixelY: i32, width: u32, height: u32, span: f32) -> f32 {
  let x = u32(clamp(pixelX, 0, i32(width) - 1));
  let y = u32(clamp(pixelY, 0, i32(height) - 1));
  let value = sphereValues[y * width + x];
  if (value != value) {
    return 0.0;
  }
  return clamp((value - sphereUniforms.params0.x) / span, 0.0, 1.0);
}

fn sphereIsZeroPaletteValue(pixelX: i32, pixelY: i32, width: u32, height: u32, span: f32) -> bool {
  return sphereNormalizedValueAt(pixelX, pixelY, width, height, span) == 0.0;
}

fn sphereSobelMagnitude(x: u32, y: u32, width: u32, height: u32, span: f32) -> f32 {
  let px = i32(x);
  let py = i32(y);
  let hasZeroPaletteNeighbor =
    sphereIsZeroPaletteValue(px - 1, py - 1, width, height, span) ||
    sphereIsZeroPaletteValue(px, py - 1, width, height, span) ||
    sphereIsZeroPaletteValue(px + 1, py - 1, width, height, span) ||
    sphereIsZeroPaletteValue(px - 1, py, width, height, span) ||
    sphereIsZeroPaletteValue(px, py, width, height, span) ||
    sphereIsZeroPaletteValue(px + 1, py, width, height, span) ||
    sphereIsZeroPaletteValue(px - 1, py + 1, width, height, span) ||
    sphereIsZeroPaletteValue(px, py + 1, width, height, span) ||
    sphereIsZeroPaletteValue(px + 1, py + 1, width, height, span);
  if (hasZeroPaletteNeighbor) {
    return 0.0;
  }
  let tl = sphereNormalizedValueAt(px - 1, py - 1, width, height, span);
  let tc = sphereNormalizedValueAt(px, py - 1, width, height, span);
  let tr = sphereNormalizedValueAt(px + 1, py - 1, width, height, span);
  let ml = sphereNormalizedValueAt(px - 1, py, width, height, span);
  let mr = sphereNormalizedValueAt(px + 1, py, width, height, span);
  let bl = sphereNormalizedValueAt(px - 1, py + 1, width, height, span);
  let bc = sphereNormalizedValueAt(px, py + 1, width, height, span);
  let br = sphereNormalizedValueAt(px + 1, py + 1, width, height, span);
  let gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2<f32>(gx, gy));
}

@fragment
fn sphereFragment(in: SphereOut) -> @location(0) vec4<f32> {
  let width = u32(sphereUniforms.params1.y);
  let height = u32(sphereUniforms.params1.z);
  let x = min(u32(clamp(in.uv.x, 0.0, 0.999999) * f32(width)), width - 1u);
  let y = min(u32(clamp(in.uv.y, 0.0, 0.999999) * f32(height)), height - 1u);
  let value = sphereValues[y * width + x];
  if (value != value) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  let span = max(sphereUniforms.params0.y - sphereUniforms.params0.x, 0.000001);
  let normalized = clamp((value - sphereUniforms.params0.x) / span, 0.0, 1.0);
  let edge = sphereSobelMagnitude(x, y, width, height, span);
  let linearColor = decodeSRGB(paletteColor(normalized, sphereUniforms.params1.x, sphereUniforms.params0.z, sphereUniforms.params0.w, sphereUniforms.params1.w > 0.5));
  var color = encodeSRGB(linearColor * mix(1., clamp(mix(1., 6., pow(edge, 0.7)) - 0.6, 0.5, 4.), sphereUniforms.params2.x));
  let hdrFactor = sphereUniforms.params0.w;
  if (max(max(color.x, color.y), color.z) > hdrFactor) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  return vec4<f32>(color, 1.0);
}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'fullScreenVertex' },
    fragment: { module, entryPoint: 'imageFragment', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const spherePipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: sphereModule,
      entryPoint: 'sphereVertex',
      buffers: [{
        arrayStride: 20,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x2' },
        ],
      }],
    },
    fragment: { module: sphereModule, entryPoint: 'sphereFragment', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const uniformData = new Float32Array(12);
  const uniformBuffer = createBuffer(device, uniformData.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const sphereUniformData = new Float32Array(28);
  const sphereUniformBuffer = createBuffer(device, sphereUniformData.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const sphereGeometry = createSphereGeometry(96, 48);
  const sphereVertexBuffer = createBufferWithData(device, sphereGeometry.vertices, GPUBufferUsage.VERTEX);
  const sphereIndexBuffer = createBufferWithData(device, sphereGeometry.indices, GPUBufferUsage.INDEX);
  let frameBuffer = null;
  let bindGroup = null;
  let sphereBindGroup = null;
  let depthTexture = null;
  let width = 1;
  let height = 1;
  const rotation = {
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
    pitch: 0,
    yaw: 0,
  };

  context.canvas.addEventListener('pointerdown', (event) => {
    if (!visuals.spherical) {
      return;
    }
    event.preventDefault();
    rotation.dragging = true;
    rotation.pointerId = event.pointerId;
    rotation.lastX = event.clientX;
    rotation.lastY = event.clientY;
    rotation.velocityX = 0;
    rotation.velocityY = 0;
    context.canvas.setPointerCapture(event.pointerId);
  }, { signal });
  context.canvas.addEventListener('pointermove', (event) => {
    if (!rotation.dragging || event.pointerId !== rotation.pointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - rotation.lastX;
    const dy = event.clientY - rotation.lastY;
    rotation.lastX = event.clientX;
    rotation.lastY = event.clientY;
    rotation.yaw -= dx * 0.01;
    rotation.pitch = clampNumber(rotation.pitch + dy * 0.01, -Math.PI * 0.5, Math.PI * 0.5);
    rotation.velocityX = dy * 0.01;
    rotation.velocityY = -dx * 0.01;
    render();
  }, { signal });
  const releasePointer = (event) => {
    if (event.pointerId !== rotation.pointerId) {
      return;
    }
    rotation.dragging = false;
    rotation.pointerId = null;
    if (context.canvas.hasPointerCapture(event.pointerId)) {
      context.canvas.releasePointerCapture(event.pointerId);
    }
  };
  context.canvas.addEventListener('pointerup', releasePointer, { signal });
  context.canvas.addEventListener('pointercancel', releasePointer, { signal });

  function setDimensions(nextWidth, nextHeight) {
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    depthTexture?.destroy();
    depthTexture = null;
  }

  function setFrame(data, nextWidth, nextHeight) {
    setDimensions(nextWidth, nextHeight);
    if (!frameBuffer || frameBuffer.size < data.byteLength) {
      frameBuffer?.destroy();
      frameBuffer = createBuffer(device, data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: frameBuffer } },
        ],
      });
      sphereBindGroup = device.createBindGroup({
        layout: spherePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: sphereUniformBuffer } },
          { binding: 1, resource: { buffer: frameBuffer } },
        ],
      });
    }
    device.queue.writeBuffer(frameBuffer, 0, data);
  }

  function render() {
    if (!bindGroup) {
      return;
    }
    if (visuals.spherical) {
      renderSphere();
      return;
    }
    uniformData.set([visuals.min, visuals.max, visuals.hue, visuals.hdr, visuals.selected, width, height, visuals.emphasis ? 1 : 0, visuals.edgeContrast, 0, 0, 0]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    renderPass(device, context, pipeline, bindGroup, [0, 0, 0, 1], 3);
  }

  function renderSphere() {
    if (!sphereBindGroup) {
      return;
    }
    applyCloudMomentum(rotation);
    const aspect = Math.max(1, context.canvas.width) / Math.max(1, context.canvas.height);
    const mvp = createSphereMvp(rotation.pitch, rotation.yaw, aspect);
    sphereUniformData.set(mvp, 0);
    sphereUniformData.set([visuals.min, visuals.max, visuals.hue, visuals.hdr, visuals.selected, width, height, visuals.emphasis ? 1 : 0, visuals.edgeContrast, 0, 0, 0], 16);
    device.queue.writeBuffer(sphereUniformBuffer, 0, sphereUniformData);
    if (!depthTexture) {
      depthTexture = device.createTexture({
        size: [context.canvas.width, context.canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(spherePipeline);
    pass.setBindGroup(0, sphereBindGroup);
    pass.setVertexBuffer(0, sphereVertexBuffer);
    pass.setIndexBuffer(sphereIndexBuffer, 'uint32');
    pass.drawIndexed(sphereGeometry.indices.length);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { setDimensions, setFrame, render };
}

function createStripRenderer(device, context, format, visuals) {
  const module = device.createShaderModule({
    code: `${COLOR_WGSL}
${FULL_SCREEN_WGSL}
struct StripUniforms { params: vec4<f32> };
@group(0) @binding(0) var<uniform> uniforms: StripUniforms;
@fragment
fn stripFragment(in: VertexOut) -> @location(0) vec4<f32> {
  let color = paletteColor(in.uv.x, uniforms.params.x, uniforms.params.y, uniforms.params.z, uniforms.params.w > 0.5);
  return vec4<f32>(color, 1.0);
}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'fullScreenVertex' },
    fragment: { module, entryPoint: 'stripFragment', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const data = new Float32Array(4);
  const buffer = createBuffer(device, data.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
  function render() {
    data.set([visuals.selected, visuals.hue, visuals.hdr, visuals.emphasis ? 1 : 0]);
    device.queue.writeBuffer(buffer, 0, data);
    renderPass(device, context, pipeline, bindGroup, [0, 0, 0, 1], 3);
  }
  return { render };
}

function createGraphPaletteRenderer(device, context, format, visuals) {
  const module = device.createShaderModule({
    code: `${COLOR_WGSL}
${FULL_SCREEN_WGSL}
struct GraphPaletteUniforms { params: vec4<f32> };
@group(0) @binding(0) var<uniform> uniforms: GraphPaletteUniforms;
@fragment
fn graphPaletteFragment(in: VertexOut) -> @location(0) vec4<f32> {
  let t = clamp(in.uv.y, 0.0, 1.0);
  let color = paletteColor(t, uniforms.params.x, uniforms.params.y, uniforms.params.z, uniforms.params.w > 0.5);
  return vec4<f32>(color, 1.0);
}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'fullScreenVertex' },
    fragment: { module, entryPoint: 'graphPaletteFragment', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const data = new Float32Array(4);
  const buffer = createBuffer(device, data.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
  function render() {
    data.set([visuals.selected, visuals.hue, visuals.hdr, visuals.emphasis ? 1 : 0]);
    device.queue.writeBuffer(buffer, 0, data);
    renderPass(device, context, pipeline, bindGroup, [0, 0, 0, 1], 3);
  }
  return { render };
}

function createPointCloudRenderer(device, context, canvas, format, visuals, signal) {
  const module = device.createShaderModule({
    code: `${COLOR_WGSL}
struct CloudUniforms {
  mvp: mat4x4<f32>,
  params: vec4<f32>,
  params2: vec4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: CloudUniforms;

struct CloudOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) isPipe: f32,
};

fn rand(co: vec2<f32>) -> f32 {
  return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn stableRandomizer(starter: vec3<f32>) -> f32 {
  let r1 = rand(vec2<f32>(starter.x * 15020.13, starter.y * 2302.82 + starter.z * 800.1));
  let r2 = rand(vec2<f32>(starter.y * 5450.36, starter.z * 6460.2 + r1 * 2500.0));
  return rand(vec2<f32>(starter.x * 14080.33, starter.z * 2507.9 + r2 * 6300.0));
}

fn movingPoint(starter: vec3<f32>, time: f32, edge: bool) -> vec3<f32> {
  let r1 = rand(vec2<f32>(starter.x * 1502.13, starter.y * 232.82 + starter.z * 800.1));
  let r2 = rand(vec2<f32>(starter.y * 545.36, starter.z * 646.2 + r1 * 250.0));
  let r3 = rand(vec2<f32>(starter.x * 1408.33, starter.z * 257.9 + r2 * 630.0));
  let speed = select(0.001, 0.0001, edge);
  let amplitude = select(vec3<f32>(r1, r2, r3), vec3<f32>(1.0), edge);
  let wave = vec3<f32>(
    sin((0.5 + 1.5 * r2) * time * speed + 150.0 * r1),
    sin((0.5 + 1.5 * r3) * time * speed + 276.0 * r2),
    sin((0.5 + 1.5 * r1) * time * speed + 2039.0 * r3)
  );
  return (wave * amplitude + vec3<f32>(1.0)) * 0.5;
}

fn animatedColor(starter: vec3<f32>, time: f32) -> vec3<f32> {
  let edge = stableRandomizer(starter) < 0.5;
  let strength = select(0.0625, 1.0, edge);
  return mix(starter, movingPoint(starter, time, edge), strength);
}

fn toWorld(lab: vec3<f32>) -> vec3<f32> {
  let converted = 1.25 * (lab - vec3<f32>(0.5, 0.0, 0.0));
  return vec3<f32>(converted.z, converted.x - 0.05, converted.y);
}

@vertex
fn cloudVertex(@location(0) color: vec3<f32>) -> CloudOut {
  let shade = animatedColor(color, uniforms.params.x);
  var out: CloudOut;
  out.position = uniforms.mvp * vec4<f32>(toWorld(p3ToOKLab(shade)), 1.0);
  out.color = shade;
  out.isPipe = 0.0;
  return out;
}

@vertex
fn curveVertex(@location(0) position: vec3<f32>) -> CloudOut {
  let t = clamp(position.y + 0.5, 0.0, 1.0);
  let lab = colorMap(t, uniforms.params.w, uniforms.params.y, uniforms.params.z, uniforms.params2.x > 0.5);
  let dt = 1.0 / 512.0;
  let forward = toWorld(colorMap(clamp(t + dt, 0.0, 1.0), uniforms.params.w, uniforms.params.y, uniforms.params.z, uniforms.params2.x > 0.5));
  let backward = toWorld(colorMap(clamp(t - dt, 0.0, 1.0), uniforms.params.w, uniforms.params.y, uniforms.params.z, uniforms.params2.x > 0.5));
  let tangent = normalize(forward - backward);
  let reference = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(tangent.y) > 0.9);
  let bitangent = normalize(cross(reference, tangent));
  let normal = normalize(cross(tangent, bitangent));
  let circle = normalize(vec2<f32>(position.x, position.z));
  let world = toWorld(lab) + (bitangent * circle.x + normal * circle.y) * 0.00675;
  var out: CloudOut;
  out.position = uniforms.mvp * vec4<f32>(world, 1.0);
  out.color = oklabToP3(lab);
  out.isPipe = 1.0;
  return out;
}

@fragment
fn cloudFragment(in: CloudOut) -> @location(0) vec4<f32> {
  if (in.isPipe > 0.5 && min(min(in.color.x, in.color.y), in.color.z) < 0.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  if (in.isPipe > 0.5 && max(max(in.color.x, in.color.y), in.color.z) > uniforms.params.z) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  return vec4<f32>(in.color, 1.0);
}`,
  });
  const cloudPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'cloudVertex',
      buffers: [{
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
      }],
    },
    fragment: { module, entryPoint: 'cloudFragment', targets: [{ format }] },
    primitive: { topology: 'point-list' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const curvePipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'curveVertex',
      buffers: [{
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
      }],
    },
    fragment: { module, entryPoint: 'cloudFragment', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const points = buildCloudPoints(30);
  const pointBuffer = createBufferWithData(device, points, GPUBufferUsage.VERTEX);
  const curve = createTubeGeometry(0.5, 1, 16, 512);
  const curvePositionBuffer = createBufferWithData(device, curve.positions, GPUBufferUsage.VERTEX);
  const curveIndexBuffer = createBufferWithData(device, curve.indices, GPUBufferUsage.INDEX);
  const uniformData = new Float32Array(24);
  const uniformBuffer = createBuffer(device, uniformData.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const cloudBindGroup = device.createBindGroup({
    layout: cloudPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const curveBindGroup = device.createBindGroup({
    layout: curvePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  let depthTexture = null;
  const rotation = {
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
    pitch: -0.3,
    yaw: 0.7,
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    rotation.dragging = true;
    rotation.pointerId = event.pointerId;
    rotation.lastX = event.clientX;
    rotation.lastY = event.clientY;
    rotation.velocityX = 0;
    rotation.velocityY = 0;
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!rotation.dragging || event.pointerId !== rotation.pointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - rotation.lastX;
    const dy = event.clientY - rotation.lastY;
    rotation.lastX = event.clientX;
    rotation.lastY = event.clientY;
    rotation.yaw -= dx * 0.01;
    rotation.pitch = clampNumber(rotation.pitch + dy * 0.01, -Math.PI * 0.5, Math.PI * 0.5);
    rotation.velocityX = dy * 0.01;
    rotation.velocityY = -dx * 0.01;
  }, { signal });
  const releasePointer = (event) => {
    if (event.pointerId !== rotation.pointerId) {
      return;
    }
    rotation.dragging = false;
    rotation.pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener('pointerup', releasePointer, { signal });
  canvas.addEventListener('pointercancel', releasePointer, { signal });

  function resizeDepthTexture() {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) {
      return;
    }
    depthTexture?.destroy();
    depthTexture = device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  function render() {
    if (!depthTexture) {
      resizeDepthTexture();
    }
    applyCloudMomentum(rotation);
    if (visuals.cloudAutoRotate && !rotation.dragging) {
      rotation.yaw += 0.0012;
    }
    const mvp = createCloudMvp(rotation.pitch, rotation.yaw, canvas.width / Math.max(1, canvas.height));
    uniformData.set(mvp, 0);
    uniformData.set([visuals.time * 1000, visuals.hue, visuals.hdr, visuals.selected], 16);
    uniformData.set([visuals.emphasis ? 1 : 0, 0, 0, 0], 20);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(cloudPipeline);
    pass.setBindGroup(0, cloudBindGroup);
    pass.setVertexBuffer(0, pointBuffer);
    pass.draw(points.length / 3);
    pass.setPipeline(curvePipeline);
    pass.setBindGroup(0, curveBindGroup);
    pass.setVertexBuffer(0, curvePositionBuffer);
    pass.setIndexBuffer(curveIndexBuffer, 'uint32');
    pass.drawIndexed(curve.indices.length);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { render, resizeDepthTexture };
}

function buildCloudPoints(steps) {
  const points = new Float32Array(steps * steps * steps * 3);
  let offset = 0;
  for (let r = 0; r < steps; r += 1) {
    for (let g = 0; g < steps; g += 1) {
      for (let b = 0; b < steps; b += 1) {
        points[offset++] = (r + 0.5) / steps;
        points[offset++] = (g + 0.5) / steps;
        points[offset++] = (b + 0.5) / steps;
      }
    }
  }
  return points;
}

function createSphereGeometry(longitudeSegments, latitudeSegments) {
  const vertices = [];
  const indices = [];
  for (let row = 0; row <= latitudeSegments; row += 1) {
    const v = row / latitudeSegments;
    const latitude = Math.PI * (0.5 - v);
    const cosLatitude = Math.cos(latitude);
    const y = Math.sin(latitude);
    for (let column = 0; column <= longitudeSegments; column += 1) {
      const u = column / longitudeSegments;
      const longitude = u * Math.PI * 2;
      const x = cosLatitude * Math.sin(longitude);
      const z = cosLatitude * Math.cos(longitude);
      vertices.push(x, y, z, u, v);
    }
  }
  const stride = longitudeSegments + 1;
  for (let row = 0; row < latitudeSegments; row += 1) {
    for (let column = 0; column < longitudeSegments; column += 1) {
      const first = row * stride + column;
      const next = first + stride;
      indices.push(first, next, first + 1, next, next + 1, first + 1);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

function createTubeGeometry(radius, height, radialSegments, lengthSegments) {
  const positions = [];
  const indices = [];
  for (let row = 0; row <= lengthSegments; row += 1) {
    const y = row / lengthSegments * height - height * 0.5;
    for (let column = 0; column <= radialSegments; column += 1) {
      const angle = column / radialSegments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }
  const stride = radialSegments + 1;
  for (let row = 0; row < lengthSegments; row += 1) {
    for (let column = 0; column < radialSegments; column += 1) {
      const first = row * stride + column;
      const next = first + stride;
      indices.push(first, next, first + 1, next, next + 1, first + 1);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function applyCloudMomentum(rotation) {
  if (rotation.dragging) {
    return;
  }
  rotation.yaw += rotation.velocityY;
  rotation.pitch = clampNumber(rotation.pitch + rotation.velocityX, -Math.PI * 0.5, Math.PI * 0.5);
  rotation.velocityX *= 0.966;
  rotation.velocityY *= 0.966;
  if (rotation.velocityX ** 2 + rotation.velocityY ** 2 < 1e-7) {
    rotation.velocityX = 0;
    rotation.velocityY = 0;
  }
}

export function cloudProjectionBounds(aspect) {
  return [1.08 * Math.max(1, aspect), 1.08 * Math.max(1, 1 / aspect)];
}

function createCloudMvp(pitch, yaw, aspect = 1) {
  const eye = [
    6 * Math.sin(yaw) * Math.cos(pitch),
    6 * Math.sin(pitch),
    6 * Math.cos(yaw) * Math.cos(pitch),
  ];
  const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
  // Widen the orthographic frustum along the canvas's long axis. Equal world
  // lengths still occupy equal screen lengths; the cloud never stretches.
  const [halfWidth, halfHeight] = cloudProjectionBounds(aspect);
  const projection = mat4Ortho(-halfWidth, halfWidth, -halfHeight, halfHeight, 0.1, 10);
  const model = mat4Scale(1.5);
  return mat4Multiply(projection, mat4Multiply(view, model));
}

function createSphereMvp(pitch, yaw, aspect) {
  const eye = [
    4 * Math.sin(yaw) * Math.cos(pitch),
    4 * Math.sin(pitch),
    4 * Math.cos(yaw) * Math.cos(pitch),
  ];
  const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
  const projection = mat4Ortho(-aspect, aspect, -1, 1, 0.1, 8);
  const model = mat4Scale(0.92);
  return mat4Multiply(projection, mat4Multiply(view, model));
}

function mat4Scale(scale) {
  return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1]);
}

function mat4Ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (right - left);
  const bt = 1 / (top - bottom);
  const nf = 1 / (near - far);
  return new Float32Array([
    2 * lr, 0, 0, 0,
    0, 2 * bt, 0, 0,
    0, 0, nf, 0,
    -(right + left) * lr, -(top + bottom) * bt, near * nf, 1,
  ]);
}

function mat4LookAt(eye, center, up) {
  const z = normalize3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(value) {
  const length = Math.hypot(...value) || 1;
  return value.map((component) => component / length);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createBuffer(device, size, usage) {
  return device.createBuffer({ size, usage });
}

function createBufferWithData(device, data, usage) {
  const buffer = device.createBuffer({ size: data.byteLength, usage, mappedAtCreation: true });
  new data.constructor(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

function renderPass(device, context, pipeline, bindGroup, clearColor, vertices) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(vertices);
  pass.end();
  device.queue.submit([encoder.finish()]);
}
