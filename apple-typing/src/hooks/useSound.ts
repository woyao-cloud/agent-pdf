/**
 * Procedural sound generator using Web Audio API.
 * No external audio files needed - all sounds are synthesized at runtime.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export class SoundManager {
  private _volume: number = 0.7;
  private _enabled: boolean = true;

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v / 100));
  }

  set enabled(e: boolean) {
    this._enabled = e;
  }

  /**
   * Short pop sound for correct typing
   */
  playCorrect() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(this._volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /**
   * Apple explosion sound
   */
  playPop() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noise = ctx.createOscillator();
    const noiseGain = ctx.createGain();

    // Main pop tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(this._volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    // Noise layer for "pop" texture
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(200, ctx.currentTime);
    noise.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);

    noiseGain.gain.setValueAtTime(this._volume * 0.15, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.1);
  }

  /**
   * Low buzzer for wrong key
   */
  playMiss() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(this._volume * 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /**
   * Lose a life - descending tone
   */
  playLoseLife() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(this._volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }

  /**
   * Game over sound - dramatic descending
   */
  playGameOver() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const notes = [523, 440, 349, 262]; // C5 A4 F4 C4

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.25;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(this._volume * 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  /**
   * Combo increase fanfare
   */
  playCombo(level: number) {
    if (!this._enabled) return;
    if (level < 3) return; // Only on 3+ combos

    const ctx = getAudioContext();
    const baseFreq = 523 + Math.min(level, 10) * 30;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.setValueAtTime(baseFreq * 1.25, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(this._volume * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  }

  /**
   * Level start countdown beep
   */
  playStartBeep() {
    if (!this._enabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(this._volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  }
}

export function useSound(): SoundManager {
  return new SoundManager();
}