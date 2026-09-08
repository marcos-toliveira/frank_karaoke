/**
 * Frank Karaoke - YIN Pitch Detection Algorithm
 * Ported directly from lib/features/audio/pitch_detector.dart
 * Reference: De Cheveigné & Kawahara (2002)
 */

class PitchResult {
  constructor(pitchHz = 0, confidence = 0) {
    this.pitchHz = pitchHz;
    this.confidence = confidence;
  }

  static get none() {
    return new PitchResult(0, 0);
  }
}

class PitchDetector {
  constructor(sampleRate = 44100, threshold = 0.70) {
    this.sampleRate = sampleRate;
    this.threshold = threshold; // 0.70 for mixed mic+speaker signals
    this.diffBuf = null;
    this.cmndfBuf = null;
  }

  detectPitch(samples) {
    return this.detectPitchWithConfidence(samples).pitchHz;
  }

  detectPitchWithConfidence(samples) {
    if (!samples || samples.length < 2) return PitchResult.none;

    const halfLen = Math.floor(samples.length / 2);
    const diff = this._differenceFunction(samples, halfLen);
    const cmndf = this._cumulativeMeanNormalized(diff, halfLen);

    const result = this._absoluteThresholdWithConfidence(cmndf, halfLen);
    if (!result) {
      return PitchResult.none;
    }

    const tauEstimate = result.tau;
    const cmndfMin = result.cmndfMin;
    const betterTau = this._parabolicInterpolation(cmndf, tauEstimate, halfLen);

    if (betterTau <= 0) return PitchResult.none;

    const pitchHz = this.sampleRate / betterTau;
    const confidence = Math.max(0.0, Math.min(1.0, 1.0 - cmndfMin / this.threshold));

    return new PitchResult(pitchHz, confidence);
  }

  _differenceFunction(samples, halfLen) {
    if (!this.diffBuf || this.diffBuf.length !== halfLen) {
      this.diffBuf = new Float64Array(halfLen);
    }
    const diff = this.diffBuf;
    for (let tau = 1; tau < halfLen; tau++) {
      let sum = 0.0;
      for (let i = 0; i < halfLen; i++) {
        const delta = samples[i] - samples[i + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }
    return diff;
  }

  _cumulativeMeanNormalized(diff, halfLen) {
    if (!this.cmndfBuf || this.cmndfBuf.length !== halfLen) {
      this.cmndfBuf = new Float64Array(halfLen);
    }
    const cmndf = this.cmndfBuf;
    cmndf[0] = 1.0;
    let runningSum = 0.0;
    for (let tau = 1; tau < halfLen; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1.0;
    }
    return cmndf;
  }

  _absoluteThresholdWithConfidence(cmndf, halfLen) {
    const minTau = Math.floor(this.sampleRate / 1000); // corresponds to 1000 Hz max
    for (let tau = minTau; tau < halfLen; tau++) {
      if (cmndf[tau] < this.threshold) {
        while (tau + 1 < halfLen && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        return { tau, cmndfMin: cmndf[tau] };
      }
    }
    return null;
  }

  _parabolicInterpolation(cmndf, tau, halfLen) {
    if (tau <= 0 || tau >= halfLen - 1) return tau;

    const s0 = cmndf[tau - 1];
    const s1 = cmndf[tau];
    const s2 = cmndf[tau + 1];

    const denominator = 2 * s1 - s2 - s0;
    if (Math.abs(denominator) < 1e-10) return tau;

    return tau + (s2 - s0) / (2 * denominator);
  }

  static rmsEnergy(samples) {
    if (!samples || samples.length === 0) return 0.0;
    let sum = 0.0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PitchResult, PitchDetector };
}
