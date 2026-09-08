/**
 * Frank Karaoke - Bandpass Filter
 * Ported directly from lib/features/audio/bandpass_filter.dart
 * 
 * Cascaded Butterworth 2nd-order IIR filter:
 * Highpass at 200 Hz (attenuates bass / kick bleed from speakers)
 * Lowpass at 3500 Hz (attenuates cymbals and high-frequency noise)
 */

class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    this.b0 = b0;
    this.b1 = b1;
    this.b2 = b2;
    this.a1 = a1;
    this.a2 = a2;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  static highPass(cutoff, sampleRate) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * 0.707); // Butterworth Q=0.707
    const a0 = 1 + alpha;

    return new Biquad(
      (1 + cosW0) / 2 / a0,
      -(1 + cosW0) / a0,
      (1 + cosW0) / 2 / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0
    );
  }

  static lowPass(cutoff, sampleRate) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * 0.707);
    const a0 = 1 + alpha;

    return new Biquad(
      (1 - cosW0) / 2 / a0,
      (1 - cosW0) / a0,
      (1 - cosW0) / 2 / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0
    );
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

class BandpassFilter {
  constructor(sampleRate = 44100, lowCutoff = 200, highCutoff = 3500) {
    this.sampleRate = sampleRate;
    this.lowCutoff = lowCutoff;
    this.highCutoff = highCutoff;
    this.highPass = Biquad.highPass(lowCutoff, sampleRate);
    this.lowPass = Biquad.lowPass(highCutoff, sampleRate);
    this.outputBuffer = null;
  }

  process(samples) {
    const len = samples.length;
    if (!this.outputBuffer || this.outputBuffer.length !== len) {
      this.outputBuffer = new Float64Array(len);
    }
    const out = this.outputBuffer;
    for (let i = 0; i < len; i++) {
      let s = samples[i];
      s = this.highPass.process(s);
      s = this.lowPass.process(s);
      out[i] = s;
    }
    return out;
  }

  reset() {
    this.highPass.reset();
    this.lowPass.reset();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Biquad, BandpassFilter };
}
