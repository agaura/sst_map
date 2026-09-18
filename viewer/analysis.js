// One-sided peak amplitudes, with mean-filled missing values.
// DC and the even-length Nyquist bin must not be doubled.
export function fourierAmplitudes(values) {
  const finite = Array.from(values).filter(Number.isFinite);
  if (!finite.length) return new Float64Array(0);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const filled = Array.from(values, value => Number.isFinite(value) ? value : mean);
  const n = filled.length, result = new Float64Array(Math.floor(n / 2) + 1);
  for (let frequency = 0; frequency < result.length; frequency++) {
    let real = 0, imaginary = 0;
    for (let index = 0; index < n; index++) {
      const angle = -2 * Math.PI * frequency * index / n;
      real += filled[index] * Math.cos(angle);
      imaginary += filled[index] * Math.sin(angle);
    }
    result[frequency] = Math.hypot(real, imaginary) * (frequency === 0 || (n % 2 === 0 && frequency === n / 2) ? 1 / n : 2 / n);
  }
  return result;
}
