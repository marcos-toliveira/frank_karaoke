/**
 * Frank Karaoke - Overlay UI Engine
 * Ported directly from lib/features/overlay/webview_overlay.dart
 * Uses DOM createElement to strictly adhere to YouTube's Trusted Types CSP.
 */

class KaraokeOverlay {
  constructor(options = {}) {
    this.container = null;
    this.scoreBox = null;
    this.scoreNum = null;
    this.overallNum = null;
    this.streakBadge = null;
    this.noteDisplay = null;
    this.rmsBar = null;
    this.trailCanvas = null;
    this.trailCtx = null;
    this.history = [];
    this.maxHistory = 80;

    this.onPresetChange = options.onPresetChange || null;
    this.onModeChange = options.onModeChange || null;
    this.onPitchShiftChange = options.onPitchShiftChange || null;
    this.onRestart = options.onRestart || null;
    this.onCalibrate = options.onCalibrate || null;

    this.init();
  }

  init() {
    if (document.getElementById('fk-overlay-root')) return;

    // Root wrapper
    const root = document.createElement('div');
    root.id = 'fk-overlay-root';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999999;font-family:system-ui,-apple-system,sans-serif;user-select:none;';

    // Top Bar Container
    const topBar = document.createElement('div');
    topBar.style.cssText = 'position:absolute;top:20px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;';

    // Left: Settings & Status
    const leftControls = document.createElement('div');
    leftControls.style.cssText = 'display:flex;align-items:center;gap:12px;pointer-events:auto;';

    const gearBtn = document.createElement('button');
    gearBtn.textContent = '⚙';
    gearBtn.title = 'Configurações do Frank Karaoke';
    gearBtn.style.cssText = 'width:44px;height:44px;border-radius:22px;background:rgba(26,26,46,0.85);backdrop-filter:blur(8px);border:1px solid rgba(108,92,231,0.5);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,0,0,0.4);transition:transform 0.2s;';
    gearBtn.onmouseenter = () => gearBtn.style.transform = 'scale(1.08)';
    gearBtn.onmouseleave = () => gearBtn.style.transform = 'scale(1.0)';
    gearBtn.onclick = () => this.toggleSettingsModal();

    this.noteDisplay = document.createElement('div');
    this.noteDisplay.textContent = '--';
    this.noteDisplay.style.cssText = 'background:rgba(26,26,46,0.85);backdrop-filter:blur(8px);border:1px solid rgba(108,92,231,0.5);color:#00d2ff;font-weight:700;font-size:18px;padding:8px 16px;border-radius:20px;min-width:40px;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.3);';

    leftControls.appendChild(gearBtn);
    leftControls.appendChild(this.noteDisplay);

    // Right: Score Dashboard Box
    this.scoreBox = document.createElement('div');
    this.scoreBox.style.cssText = 'background:rgba(22,33,62,0.9);backdrop-filter:blur(12px);border:1px solid rgba(108,92,231,0.6);border-radius:20px;padding:14px 22px;color:#fff;display:flex;flex-direction:column;align-items:center;pointer-events:auto;box-shadow:0 8px 32px rgba(108,92,231,0.3);min-width:140px;cursor:pointer;';
    this.scoreBox.onclick = () => this.toggleModeModal();

    const scoreTitle = document.createElement('div');
    scoreTitle.textContent = 'PONTUAÇÃO';
    scoreTitle.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,0.6);margin-bottom:2px;';

    this.scoreNum = document.createElement('div');
    this.scoreNum.textContent = '0';
    this.scoreNum.style.cssText = 'font-size:48px;font-weight:900;line-height:1;background:linear-gradient(135deg,#6c5ce7,#fd79a8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;';

    this.streakBadge = document.createElement('div');
    this.streakBadge.style.cssText = 'font-size:12px;font-weight:700;color:#ff7675;margin-top:4px;display:none;';

    const overallRow = document.createElement('div');
    overallRow.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;';
    overallRow.textContent = 'Geral: ';
    this.overallNum = document.createElement('span');
    this.overallNum.textContent = '0';
    this.overallNum.style.fontWeight = 'bold';
    overallRow.appendChild(this.overallNum);

    this.scoreBox.appendChild(scoreTitle);
    this.scoreBox.appendChild(this.scoreNum);
    this.scoreBox.appendChild(this.streakBadge);
    this.scoreBox.appendChild(overallRow);

    topBar.appendChild(leftControls);
    topBar.appendChild(this.scoreBox);
    root.appendChild(topBar);

    // Bottom Canvas for Pitch Trail
    const bottomContainer = document.createElement('div');
    bottomContainer.style.cssText = 'position:absolute;bottom:70px;left:50%;transform:translateX(-50%);width:min(90%,700px);height:60px;pointer-events:none;display:flex;flex-direction:column;align-items:center;';

    this.trailCanvas = document.createElement('canvas');
    this.trailCanvas.width = 700;
    this.trailCanvas.height = 60;
    this.trailCanvas.style.cssText = 'width:100%;height:100%;border-radius:12px;background:rgba(26,26,46,0.3);backdrop-filter:blur(4px);';
    this.trailCtx = this.trailCanvas.getContext('2d');

    bottomContainer.appendChild(this.trailCanvas);
    root.appendChild(bottomContainer);

    document.body.appendChild(root);
    this.container = root;

    this._setupModals();
  }

  updateScore(liveScore, overallScore, noteName, streakCount = 0) {
    if (this.scoreNum) this.scoreNum.textContent = liveScore;
    if (this.overallNum) this.overallNum.textContent = overallScore;
    if (this.noteDisplay && noteName) this.noteDisplay.textContent = noteName;

    if (this.streakBadge) {
      if (streakCount >= 5) {
        this.streakBadge.style.display = 'block';
        this.streakBadge.textContent = streakCount >= 30 ? `🔥 ${streakCount}x ON FIRE!` : `🔥 ${streakCount}x COMBO`;
      } else {
        this.streakBadge.style.display = 'none';
      }
    }
  }

  addPitchPoint(normalizedPitch, quality) {
    this.history.push({ pitch: normalizedPitch, quality: quality });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this._drawTrail();
  }

  _drawTrail() {
    if (!this.trailCtx || !this.trailCanvas) return;
    const ctx = this.trailCtx;
    const w = this.trailCanvas.width;
    const h = this.trailCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const step = w / this.maxHistory;
    for (let i = 0; i < this.history.length; i++) {
      const p = this.history[i];
      if (p.pitch <= 0) continue;

      const x = i * step;
      const y = h - (p.pitch * (h - 16) + 8);
      const r = 4 + p.quality * 4;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.quality > 0.7 ? '#00d2ff' : (p.quality > 0.4 ? '#6c5ce7' : '#fd79a8');
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fill();
    }
  }

  _setupModals() {
    const modalBg = document.createElement('div');
    modalBg.id = 'fk-settings-modal';
    modalBg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:1000000;pointer-events:auto;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#1a1a2e;border:1px solid rgba(108,92,231,0.5);border-radius:24px;padding:28px 36px;color:#fff;width:min(90%,460px);box-shadow:0 12px 40px rgba(0,0,0,0.6);font-family:system-ui,-apple-system,sans-serif;';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;';
    const title = document.createElement('h2');
    title.textContent = 'Configurações do Karaokê';
    title.style.cssText = 'margin:0;font-size:20px;font-weight:700;color:#00d2ff;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;line-height:1;';
    closeBtn.onclick = () => modalBg.style.display = 'none';
    headerRow.appendChild(title);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    // Presets section
    const presetSection = document.createElement('div');
    presetSection.style.cssText = 'margin-bottom:18px;';
    const presetLabel = document.createElement('label');
    presetLabel.textContent = 'PRESET DO MICROFONE';
    presetLabel.style.cssText = 'font-size:12px;color:#aaa;font-weight:700;display:block;margin-bottom:8px;';
    presetSection.appendChild(presetLabel);

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:8px;';
    const presets = [
      { id: 'clean', label: '🎤 Limpo' },
      { id: 'room',  label: '🏠 Sala' },
      { id: 'party', label: '🎉 Festa' }
    ];
    const presetBtns = [];
    presets.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.textContent = p.label;
      btn.dataset.preset = p.id;
      btn.style.cssText = `flex:1;padding:10px;border-radius:12px;background:#16213e;border:1px solid ${idx === 0 ? '#6c5ce7' : 'rgba(255,255,255,0.2)'};color:${idx === 0 ? '#fff' : '#aaa'};cursor:pointer;font-weight:600;`;
      btn.onclick = () => {
        presetBtns.forEach(b => {
          b.style.border = '1px solid rgba(255,255,255,0.2)';
          b.style.color = '#aaa';
        });
        btn.style.border = '1px solid #6c5ce7';
        btn.style.color = '#fff';
        if (this.onPresetChange) this.onPresetChange(p.id);
      };
      presetBtns.push(btn);
      presetRow.appendChild(btn);
    });
    presetSection.appendChild(presetRow);
    card.appendChild(presetSection);

    // Pitch shift section
    const pitchSection = document.createElement('div');
    pitchSection.style.cssText = 'margin-bottom:18px;';
    const pitchLabel = document.createElement('label');
    pitchLabel.textContent = 'AJUSTE DE TOM (SEMITONS)';
    pitchLabel.style.cssText = 'font-size:12px;color:#aaa;font-weight:700;display:block;margin-bottom:8px;';
    pitchSection.appendChild(pitchLabel);

    const pitchRow = document.createElement('div');
    pitchRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#16213e;padding:8px 16px;border-radius:12px;';
    
    let currentShift = 0;
    const shiftValEl = document.createElement('span');
    shiftValEl.textContent = '0 semitons';
    shiftValEl.style.cssText = 'font-size:16px;font-weight:bold;color:#fff;';

    const downBtn = document.createElement('button');
    downBtn.textContent = '-1';
    downBtn.style.cssText = 'padding:6px 14px;border-radius:8px;background:#6c5ce7;border:none;color:#fff;font-weight:bold;cursor:pointer;';
    downBtn.onclick = () => {
      if (currentShift > -6) {
        currentShift--;
        shiftValEl.textContent = `${currentShift > 0 ? '+' : ''}${currentShift} semitons`;
        if (this.onPitchShiftChange) this.onPitchShiftChange(currentShift);
      }
    };

    const upBtn = document.createElement('button');
    upBtn.textContent = '+1';
    upBtn.style.cssText = 'padding:6px 14px;border-radius:8px;background:#6c5ce7;border:none;color:#fff;font-weight:bold;cursor:pointer;';
    upBtn.onclick = () => {
      if (currentShift < 6) {
        currentShift++;
        shiftValEl.textContent = `${currentShift > 0 ? '+' : ''}${currentShift} semitons`;
        if (this.onPitchShiftChange) this.onPitchShiftChange(currentShift);
      }
    };

    pitchRow.appendChild(downBtn);
    pitchRow.appendChild(shiftValEl);
    pitchRow.appendChild(upBtn);
    pitchSection.appendChild(pitchRow);
    card.appendChild(pitchSection);

    // Action buttons row
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;gap:10px;margin-top:24px;';

    const calibBtn = document.createElement('button');
    calibBtn.textContent = '🎙️ Calibrar Mic (3s)';
    calibBtn.style.cssText = 'flex:1;padding:12px;border-radius:12px;background:rgba(0,210,255,0.15);border:1px solid #00d2ff;color:#00d2ff;font-weight:700;cursor:pointer;';
    calibBtn.onclick = () => {
      if (this.onCalibrate) this.onCalibrate((statusText) => {
        calibBtn.textContent = statusText;
      });
    };

    const restartBtn = document.createElement('button');
    restartBtn.textContent = '↻ Reiniciar';
    restartBtn.style.cssText = 'flex:1;padding:12px;border-radius:12px;background:#6c5ce7;border:none;color:#fff;font-weight:700;cursor:pointer;';
    restartBtn.onclick = () => {
      if (this.onRestart) this.onRestart();
      modalBg.style.display = 'none';
    };

    actionRow.appendChild(calibBtn);
    actionRow.appendChild(restartBtn);
    card.appendChild(actionRow);

    modalBg.appendChild(card);
    modalBg.onclick = (e) => { if (e.target === modalBg) modalBg.style.display = 'none'; };
    document.body.appendChild(modalBg);
  }

  toggleSettingsModal() {
    const modal = document.getElementById('fk-settings-modal');
    if (modal) {
      modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }
  }

  toggleModeModal() {
    this.toggleSettingsModal();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KaraokeOverlay };
}
