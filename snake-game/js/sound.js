/* ==========================================================================
   Snake Game — sound effects
   Tiny synthesised sounds via the Web Audio API (no audio files needed).
   ========================================================================== */

class SoundBoard {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
  }

  /** Create or resume the AudioContext. Must be called from a user gesture. */
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
  }

  /**
   * Schedule one short tone.
   * @param {number} freq Starting frequency in Hz.
   * @param {object} [options]
   */
  tone(freq, options = {}) {
    if (!this.enabled || !this.ctx) return;

    const {
      duration = 0.12,
      type = 'sine',
      volume = 0.16,
      delay = 0,
      slideTo = null,
    } = options;

    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  click() {
    this.unlock();
    this.tone(440, { duration: 0.045, type: 'square', volume: 0.06 });
  }

  eat() {
    this.unlock();
    this.tone(540, { duration: 0.08, type: 'triangle', volume: 0.2 });
    this.tone(900, { duration: 0.11, type: 'triangle', volume: 0.16, delay: 0.06 });
  }

  levelUp() {
    [660, 880, 1100].forEach((freq, index) => {
      this.tone(freq, { duration: 0.1, type: 'sine', volume: 0.13, delay: index * 0.065 });
    });
  }

  pause() {
    this.tone(420, { duration: 0.09, type: 'sine', volume: 0.11, slideTo: 300 });
  }

  resume() {
    this.tone(380, { duration: 0.1, type: 'sine', volume: 0.11, slideTo: 560 });
  }

  gameOver() {
    [392, 311, 233, 155].forEach((freq, index) => {
      this.tone(freq, { duration: 0.22, type: 'sawtooth', volume: 0.1, delay: index * 0.13 });
    });
  }

  win() {
    [523, 659, 784, 1047].forEach((freq, index) => {
      this.tone(freq, { duration: 0.16, type: 'triangle', volume: 0.14, delay: index * 0.1 });
    });
  }
}

// Expose for game.js (plain scripts, no bundler required).
window.SoundBoard = SoundBoard;
