/**
 * Frank Karaoke - YouTube Content Script Orchestrator
 */

(function() {
  console.log('[Frank Karaoke] Injetando motor de karaokê no YouTube...');

  let audioContext = null;
  let micStream = null;
  let scriptNode = null;
  let scoringSession = null;
  let overlay = null;
  let currentVideo = null;

  function initKaraoke() {
    if (window._frankKaraokeInitialized) return;
    window._frankKaraokeInitialized = true;

    // Initialize scoring session
    scoringSession = new ScoringSession({
      onUpdate: (data) => {
        if (!overlay) return;
        overlay.updateScore(data.totalScore, data.overallScore, data.noteName, data.streakCount);

        const normalizedPitch = data.pitchHz > 60
          ? Math.max(0, Math.min(1, Math.log(data.pitchHz / 100) / Math.log(800 / 100)))
          : 0;
        overlay.addPitchPoint(normalizedPitch, data.frameScore);
      }
    });

    // Initialize UI overlay
    overlay = new KaraokeOverlay({
      onPresetChange: (presetName) => {
        if (AudioPresets[presetName]) {
          scoringSession.preset = AudioPresets[presetName];
          scoringSession.calibratedNoiseGate = AudioPresets[presetName].noiseGateThreshold;
          scoringSession.reset();
        }
      },
      onPitchShiftChange: (semitones) => {
        scoringSession.pitchShift = semitones;
        applyPitchShift(semitones);
      },
      onRestart: () => {
        if (currentVideo) {
          currentVideo.currentTime = 0;
          currentVideo.play();
        }
        scoringSession.reset();
        scoringSession.start();
      },
      onCalibrate: (statusCallback) => {
        calibrateMic(statusCallback);
      }
    });

    setupVideoTracking();
    setupAudioCapture();
  }

  function applyPitchShift(semitones) {
    const video = document.querySelector('video');
    if (!video) return;
    video.preservesPitch = false;
    video.playbackRate = Math.pow(2, semitones / 12);
  }

  function setupVideoTracking() {
    function bindVideo(v) {
      if (!v || v._fkBound) return;
      v._fkBound = true;
      currentVideo = v;

      v.addEventListener('play', () => {
        if (scoringSession) scoringSession.resume();
      });

      v.addEventListener('pause', () => {
        if (scoringSession) scoringSession.pause();
      });

      v.addEventListener('seeked', () => {
        if (scoringSession) {
          scoringSession.reset();
          scoringSession.start();
        }
      });

      // Start scoring if already playing
      if (!v.paused && scoringSession) {
        scoringSession.start();
      }
    }

    document.querySelectorAll('video').forEach(bindVideo);

    const observer = new MutationObserver(() => {
      document.querySelectorAll('video').forEach(bindVideo);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  async function setupAudioCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      micStream = stream;
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const source = audioContext.createMediaStreamSource(stream);

      // Buffer size 2048 samples (~46ms per frame)
      scriptNode = audioContext.createScriptProcessor(2048, 1, 1);

      scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > peak) peak = abs;
        }

        if (scoringSession && scoringSession.isActive) {
          scoringSession.processFrame(inputData, peak);
        }
      };

      source.connect(scriptNode);
      // Connect to a mute destination to keep processing active
      const nullGain = audioContext.createGain();
      nullGain.gain.value = 0;
      scriptNode.connect(nullGain);
      nullGain.connect(audioContext.destination);

      console.log('[Frank Karaoke] Microfone capturado com sucesso.');
      if (scoringSession) scoringSession.start();
    } catch (err) {
      console.warn('[Frank Karaoke] Permissão de microfone pendente ou negada:', err);
    }
  }

  async function calibrateMic(statusCallback) {
    if (!audioContext || !micStream) {
      await setupAudioCapture();
    }
    if (statusCallback) statusCallback('Silêncio... 3s');

    const peaks = [];
    const collectHandler = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      let p = 0;
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > p) p = abs;
      }
      peaks.push(p);
    };

    if (scriptNode) scriptNode.addEventListener('audioprocess', collectHandler);

    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0 && statusCallback) {
        statusCallback(`Silêncio... ${count}s`);
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      if (scriptNode) scriptNode.removeEventListener('audioprocess', collectHandler);

      if (peaks.length > 0) {
        peaks.sort((a, b) => a - b);
        const p90 = peaks[Math.floor(peaks.length * 0.9)];
        const noiseGate = p90 * 2.0;
        const singingThreshold = p90 * 4.0;

        if (scoringSession) {
          scoringSession.calibratedNoiseGate = noiseGate;
          scoringSession.calibratedSingingThreshold = singingThreshold;
          scoringSession.reset();
        }
        if (statusCallback) statusCallback('✅ Calibrado!');
      } else {
        if (statusCallback) statusCallback('❌ Sem dados');
      }
    }, 3000);
  }

  // Launch when page is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKaraoke);
  } else {
    initKaraoke();
  }
})();
