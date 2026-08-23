/* ===== Sniper Fury — Âm thanh tổng hợp bằng WebAudio (không cần file ngoài) ===== */
(function () {
  'use strict';

  class SoundKit {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
    }

    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.enabled = false;
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    /* Tiếng ồn trắng ngắn (dùng cho tiếng súng, va chạm) */
    _noise(duration, filterFreq, gainVal, type = 'lowpass') {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.value = gainVal;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
    }

    /* Tiếng "ping" tần số xác định */
    _tone(freq, duration, gainVal = 0.15, type = 'sine', slideTo = null) {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo !== null) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }

    shot(suppressed) {
      if (suppressed) {
        // Tiếng súng có gắn giảm thanh: "xì" nhỏ, nghe xa
        this._noise(0.07, 1400, 0.22);
        this._tone(150, 0.09, 0.1, 'triangle', 55);
      } else {
        // Tiếng súng thường: nổ + vang xa
        this._noise(0.12, 3500, 0.9);
        this._noise(0.5, 500, 0.5);
        this._tone(90, 0.25, 0.4, 'triangle', 40);
      }
    }

    empty() { this._tone(1200, 0.06, 0.12, 'square'); }

    reload() {
      this._tone(700, 0.05, 0.1, 'square');
      setTimeout(() => this._tone(500, 0.05, 0.1, 'square'), 180);
      setTimeout(() => this._tone(900, 0.06, 0.12, 'square'), 420);
    }

    hitBody() {
      this._noise(0.08, 900, 0.5);
      this._tone(160, 0.12, 0.25, 'triangle', 70);
    }

    hitHead() {
      this._noise(0.06, 1200, 0.4);
      this._tone(880, 0.18, 0.18, 'sine', 1760); // ding
    }

    hitHostage() {
      this._tone(300, 0.4, 0.3, 'sawtooth', 80);
      this._tone(200, 0.5, 0.25, 'square', 60);
    }

    dust() { this._noise(0.06, 2000, 0.15); }

    levelWin() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this._tone(f, 0.22, 0.16), i * 130)
      );
    }

    levelFail() {
      [400, 320, 240, 160].forEach((f, i) =>
        setTimeout(() => this._tone(f, 0.3, 0.18, 'sawtooth'), i * 170)
      );
    }

    click() { this._tone(600, 0.04, 0.08, 'square'); }
  }

  window.SoundKit = SoundKit;
})();