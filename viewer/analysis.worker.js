import { fourierAmplitudes } from './analysis.js';
self.onmessage = ({ data: { id, values } }) => {
  const amplitudes = fourierAmplitudes(values);
  self.postMessage({ id, amplitudes }, [amplitudes.buffer]);
};
