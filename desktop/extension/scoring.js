/**
 * Frank Karaoke - Scoring Engine & Session
 * Ported directly from:
 * - lib/features/scoring/scoring_engine.dart
 * - lib/features/scoring/scoring_session.dart
 * - lib/core/audio_preset.dart
 * - lib/core/scoring_mode.dart
 */

function hzToMidi(hz) {
  if (hz <= 0) return 0;
  return 69.0 + 12.0 * (Math.log(hz / 440.0) / Math.LN2);
}

function midiToHz(midi) {
  return 440.0 * Math.pow(2, (midi - 69.0) / 12.0);
}

function hzToSemitoneDistance(hz1, hz2) {
  if (hz1 <= 0 || hz2 <= 0) return Infinity;
  return Math.abs(12.0 * (Math.log(hz1 / hz2) / Math.LN2));
}

const AudioPresets = {
  clean: { name: 'clean', noiseGateThreshold: 0.008, pitchTolerance: 1.5, singingThreshold: 0.015 },
  room:  { name: 'room',  noiseGateThreshold: 0.015, pitchTolerance: 2.5, singingThreshold: 0.025 },
  party: { name: 'party', noiseGateThreshold: 0.030, pitchTolerance: 3.5, singingThreshold: 0.045 }
};

const ScoringModes = {
  pitchMatch: 'pitchMatch',
  contour:    'contour',
  interval:   'interval',
  streak:     'streak'
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class ScoringSession {
  constructor(options = {}) {
    this.preset = options.preset || AudioPresets.clean;
    this.mode = options.mode || ScoringModes.pitchMatch;
    this.pitchShift = options.pitchShift || 0; // semitones (-6 to +6)
    this.calibratedNoiseGate = options.calibratedNoiseGate || this.preset.noiseGateThreshold;
    this.calibratedSingingThreshold = options.calibratedSingingThreshold || this.preset.singingThreshold;

    this.pitchDetector = typeof PitchDetector !== 'undefined' ? new PitchDetector(44100, 0.70) : null;
    this.bandpass = typeof BandpassFilter !== 'undefined' ? new BandpassFilter(44100, 200, 3500) : null;

    this.isActive = false;
    this.isPaused = false;
    this.warmupDone = false;
    this.warmupTimer = null;

    this.emaScore = 0;
    this.emaInitialized = false;
    this.emaAlpha = 0.15;

    this.recentPitches = [];
    this.historySize = 15;

    this.prevSingerPitch = 0;
    this.prevSingerMidi = 0;

    this.streakCount = 0;
    this.silentFrames = 0;

    this.rmsHistory = [];
    this.rmsHistorySize = 100; // ~4s of frames
    this.baselineRms = 0;
    this.processedFrames = 0;

    this.totalVoicedFrames = 0;
    this.allTimeScoreSum = 0;

    this.onUpdate = options.onUpdate || null;
  }

  get currentScore() {
    if (!this.emaInitialized) return 0;
    return Math.max(0, Math.min(100, Math.round(this.emaScore * 100)));
  }

  get finalScore() {
    if (this.totalVoicedFrames === 0) return 0;
    return Math.max(0, Math.min(100, Math.round((this.allTimeScoreSum / this.totalVoicedFrames) * 100)));
  }

  start() {
    this.reset();
    this.isActive = true;
    this.isPaused = false;
    this.warmupDone = false;

    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.warmupTimer = setTimeout(() => {
      this.warmupDone = true;
    }, 5000);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  reset() {
    this.emaScore = 0;
    this.emaInitialized = false;
    this.recentPitches = [];
    this.prevSingerPitch = 0;
    this.prevSingerMidi = 0;
    this.streakCount = 0;
    this.silentFrames = 0;
    this.totalVoicedFrames = 0;
    this.allTimeScoreSum = 0;
    this.rmsHistory = [];
    this.baselineRms = 0;
    this.processedFrames = 0;
    if (this.bandpass) this.bandpass.reset();
  }

  stop() {
    this.isActive = false;
    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }
  }

  processFrame(samples, rawPeak) {
    if (!this.isActive || this.isPaused) return;

    // Filter audio frame
    const filteredSamples = this.bandpass ? this.bandpass.process(samples) : samples;
    const rms = rawPeak;
    this.processedFrames++;

    if (!this.warmupDone) {
      this.rmsHistory.push(rawPeak);
      return;
    }

    // Adaptive speaker-bleed baseline RMS
    this.rmsHistory.push(rawPeak);
    if (this.rmsHistory.length > this.rmsHistorySize) {
      this.rmsHistory.shift();
    }

    if (this.rmsHistory.length >= 20 && this.processedFrames % 25 === 0) {
      const sorted = [...this.rmsHistory].sort((a, b) => a - b);
      this.baselineRms = sorted[Math.floor(sorted.length / 4)]; // 25th percentile
    }

    const isVoice = this.baselineRms > 0.001
      ? rawPeak > this.baselineRms * 1.5
      : rawPeak > this.calibratedSingingThreshold;

    // Noise gate
    if (rawPeak < this.calibratedNoiseGate) {
      this.silentFrames++;
      if (this.silentFrames > 12) {
        this.prevSingerMidi = 0;
        this.prevSingerPitch = 0;
        this.recentPitches = [];
      }
      this._emit({ pitchHz: 0, noteName: '--', confidence: 0, frameScore: 0, rms });
      return;
    }
    this.silentFrames = 0;

    // Reject non-voice bleed
    if (!isVoice) {
      if (this.mode === ScoringModes.streak) this.streakCount = 0;
      this._emit({ pitchHz: 0, noteName: '--', confidence: 0, frameScore: 0, rms });
      return;
    }

    // Pitch detection
    const result = this.pitchDetector
      ? this.pitchDetector.detectPitchWithConfidence(filteredSamples)
      : { pitchHz: 0, confidence: 0 };

    if (result.pitchHz < 60 || result.confidence < 0.3) {
      if (this.mode === ScoringModes.streak) this.streakCount = 0;
      this._emit({ pitchHz: 0, noteName: '--', confidence: result.confidence, frameScore: 0, rms });
      return;
    }

    const pitchHz = result.pitchHz;
    const confidence = result.confidence;
    const singerMidi = hzToMidi(pitchHz) - this.pitchShift;

    this.recentPitches.push(singerMidi);
    if (this.recentPitches.length > this.historySize) {
      this.recentPitches.shift();
    }

    // Voice scoring
    let frameScore = this._scoreVoiceOnly(singerMidi, pitchHz, confidence);

    // Streak mode combo
    if (this.mode === ScoringModes.streak) {
      if (frameScore >= 0.4) {
        this.streakCount++;
        frameScore = Math.min(1.0, frameScore + Math.min(this.streakCount, 30) / 75.0);
      } else {
        if (this.streakCount > 5) frameScore = 0.05;
        this.streakCount = 0;
      }
    }

    this._pushScore(frameScore);

    this.prevSingerPitch = pitchHz;
    this.prevSingerMidi = singerMidi;

    // Note name calculation
    const nn = Math.round(singerMidi);
    const noteName = `${NOTE_NAMES[((nn % 12) + 12) % 12]}${Math.floor(nn / 12) - 1}`;

    this._emit({
      pitchHz,
      primaryScore: frameScore,
      noteName,
      confidence,
      frameScore,
      rms,
      streakCount: this.streakCount
    });
  }

  _scoreVoiceOnly(singerMidi, pitchHz, confidence) {
    // 1. Confidence score
    const confScore = Math.max(0.0, Math.min(1.0, (confidence - 0.3) / 0.6));

    // 2. Pitch cleanliness (deviation from chromatic note center)
    const deviation = Math.abs(singerMidi - Math.round(singerMidi)) * 100;
    const snapTolerance = (this.preset.pitchTolerance * 100) / 3;
    const rawSnap = Math.max(0.0, Math.min(1.0, 1.0 - deviation / snapTolerance));
    const cleanScore = rawSnap * confScore;

    // 3. Musicality (pitch range & musical intervals)
    let musicalScore = 0.3;
    if (this.recentPitches.length >= 5) {
      const maxP = Math.max(...this.recentPitches);
      const minP = Math.min(...this.recentPitches);
      const range = maxP - minP;

      let rangeScore;
      if (range < 0.5) {
        rangeScore = 0.0;
      } else if (range <= 6.0) {
        rangeScore = Math.max(0.0, Math.min(1.0, range / 6.0));
      } else {
        rangeScore = Math.max(0.3, 1.0 - (range - 6.0) / 10.0);
      }

      let intervalScore = 0.5;
      if (this.prevSingerPitch > 0) {
        const interval = Math.abs(singerMidi - hzToMidi(this.prevSingerPitch));
        if (interval < 0.3) intervalScore = 0.6;
        else if (interval <= 5.0) intervalScore = 1.0;
        else if (interval <= 8.0) intervalScore = 0.4;
        else intervalScore = 0.1;
      }

      musicalScore = rangeScore * 0.5 + intervalScore * 0.5;
    }

    const combined = confScore * 0.40 + cleanScore * 0.30 + musicalScore * 0.30;
    return Math.max(0.0, Math.min(1.0, combined));
  }

  _pushScore(score) {
    if (!this.emaInitialized) {
      this.emaScore = score;
      this.emaInitialized = true;
    } else {
      this.emaScore = this.emaAlpha * score + (1 - this.emaAlpha) * this.emaScore;
    }
    this.totalVoicedFrames++;
    this.allTimeScoreSum += score;
  }

  _emit(data) {
    if (this.onUpdate) {
      this.onUpdate({
        ...data,
        totalScore: this.currentScore,
        overallScore: this.finalScore,
        modeName: this.mode
      });
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hzToMidi,
    midiToHz,
    hzToSemitoneDistance,
    AudioPresets,
    ScoringModes,
    ScoringSession
  };
}
