/**
 * Frank Karaoke - Pitch Oracle
 * Ported directly from lib/features/audio/pitch_oracle.dart
 * 
 * Builds a timestamped pitch timeline of the reference song
 * to distinguish singer voice from speaker bleed.
 * Caches timelines in IndexedDB/localStorage for instant repeat plays.
 */

class PitchOracle {
  constructor() {
    this.timeline = [];
    this.isReady = false;
    this.isLoading = false;
    this.videoId = null;
  }

  get entryCount() {
    return this.timeline.length;
  }

  async loadForVideo(videoId) {
    if (this.videoId === videoId && this.isReady) return true;
    if (this.isLoading) return false;

    this.isLoading = true;
    this.timeline = [];
    this.isReady = false;
    this.videoId = videoId;

    // 1. Try loading from cache
    const cached = await this._loadFromCache(videoId);
    if (cached) {
      this.isReady = true;
      this.isLoading = false;
      console.log(`[Frank Karaoke] PitchOracle: Carregado do cache para ${videoId} (${this.timeline.length} entradas)`);
      return true;
    }

    this.isLoading = false;
    return false;
  }

  setTimeline(videoId, entries) {
    this.videoId = videoId;
    this.timeline = entries;
    this.isReady = entries.length > 0;
    this._saveToCache(videoId, entries);
  }

  getPitchAtSeconds(seconds) {
    if (!this.isReady || this.timeline.length === 0) return 0;

    const ms = Math.round(seconds * 1000);
    let lo = 0;
    let hi = this.timeline.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.timeline[mid].t < ms) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo > 0 && Math.abs(ms - this.timeline[lo - 1].t) < Math.abs(this.timeline[lo].t - ms)) {
      lo--;
    }

    return this.timeline[lo].p;
  }

  singerConfidence(micPitchHz, videoTimeSeconds) {
    if (!this.isReady) return 0.5;

    const refPitch = this.getPitchAtSeconds(videoTimeSeconds);
    if (refPitch <= 0) return 1.0; // Silêncio na música = certeza que é o cantor

    const micMidi = 69 + 12 * Math.log2(micPitchHz / 440);
    const refMidi = 69 + 12 * Math.log2(refPitch / 440);
    const micClass = ((micMidi % 12) + 12) % 12;
    const refClass = ((refMidi % 12) + 12) % 12;

    let dist = Math.abs(micClass - refClass);
    if (dist > 6) dist = 12 - dist;

    // dist = 0 -> bleed -> conf = 0.0
    // dist >= 2 -> voz diferente do speaker -> conf = 1.0
    return Math.max(0.0, Math.min(1.0, dist / 2.0));
  }

  async _loadFromCache(videoId) {
    try {
      if (typeof localStorage === 'undefined') return false;
      const key = `fk_oracle_${videoId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (data && Array.isArray(data.entries)) {
        this.timeline = data.entries;
        return this.timeline.length > 0;
      }
    } catch (e) {
      console.warn('[Frank Karaoke] Erro ao carregar cache do oracle:', e);
    }
    return false;
  }

  async _saveToCache(videoId, entries) {
    try {
      if (typeof localStorage === 'undefined') return;
      const key = `fk_oracle_${videoId}`;
      localStorage.setItem(key, JSON.stringify({ videoId, entries }));
    } catch (e) {
      console.warn('[Frank Karaoke] Erro ao salvar cache do oracle:', e);
    }
  }

  reset() {
    this.timeline = [];
    this.isReady = false;
    this.isLoading = false;
    this.videoId = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PitchOracle };
}
