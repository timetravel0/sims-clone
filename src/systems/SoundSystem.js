/**
 * SoundSystem — Sprint 5
 * Web Audio API wrapper for ambient sounds and SFX.
 *
 * Ambient tracks (looped procedural oscillators):
 *   sunny  → gentle major-chord drone
 *   rainy  → white-noise layer
 *   stormy → low rumble + noise
 *   night  → minor-chord drone
 *
 * SFX (one-shot synthesised tones):
 *   social:interaction → short chime (pitch varies by type)
 *   skill:levelUp      → ascending arpeggio
 *   budget:changed     → coins clink (high tinkle)
 *   budget:insufficient→ low dull thud
 *   mood:changed       → subtle glide tone
 *   wall:placed        → percussive thump
 *   door:placed        → wooden knock
 *
 * All sounds are synthesised — no external audio files required.
 * Autoplay gated: AudioContext starts on first user interaction.
 */
import { bus }           from '../core/EventBus.js';
import { weatherSystem } from './WeatherSystem.js';

const SFX_PITCH = {
  chat:       520,
  joke:       660,
  hug:        440,
  argue:      180,
  compliment: 880,
};

export class SoundSystem {
  constructor() {
    this._ctx      = null;
    this._master   = null;
    this._ambient  = null;
    this._muted    = false;
    this._volume   = 0.5;
    this._started  = false;

    // Gate: start AudioContext on first user gesture
    const start = () => {
      if (this._started) return;
      this._started = true;
      this._boot();
      document.removeEventListener('click', start);
      document.removeEventListener('keydown', start);
    };
    document.addEventListener('click',   start);
    document.addEventListener('keydown', start);
  }

  _boot() {
    this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._volume;
    this._master.connect(this._ctx.destination);

    this._startAmbient();

    // SFX subscriptions. Persistent so they survive bus.clear() — this is a
    // module singleton subscribed once at import (same reasoning as BudgetSystem).
    bus.onPersistent('social:interaction',  ({ type })   => this._sfxSocial(type));
    bus.onPersistent('skill:levelUp',       ()           => this._sfxSkillUp());
    bus.onPersistent('budget:changed',      ({ delta })  => { if (delta > 0) this._sfxCoin(); });
    bus.onPersistent('budget:insufficient', ()           => this._sfxThud());
    bus.onPersistent('mood:changed',        ({ next })   => this._sfxMood(next));
    bus.onPersistent('wall:placed',         ()           => this._sfxThump(120, 0.15));
    bus.onPersistent('door:placed',         ()           => this._sfxKnock());
    bus.onPersistent('weather:changed',     ()           => {
      this._stopAmbient();
      setTimeout(() => this._startAmbient(), 400);
    });
  }

  // ── Ambient ───────────────────────────────────────────────────────────────

  _startAmbient() {
    if (!this._ctx) return;
    this._ambient = [];
    const state = weatherSystem.current;

    if (state === 'rainy' || state === 'stormy') {
      this._ambient.push(this._noiseLoop(state === 'stormy' ? 0.06 : 0.04));
    }
    if (state === 'stormy') {
      this._ambient.push(this._droneLoop([60, 55], 0.04, 'sawtooth'));
    }
    if (state === 'sunny' || state === 'cloudy') {
      this._ambient.push(this._droneLoop([261, 329, 392], 0.025, 'sine'));
    }
    if (state === 'foggy') {
      this._ambient.push(this._droneLoop([220, 277], 0.02, 'sine'));
    }
  }

  _stopAmbient() {
    if (!this._ambient) return;
    const now = this._ctx?.currentTime ?? 0;
    for (const { gain, nodes } of this._ambient) {
      gain.gain.setTargetAtTime(0, now, 0.4);
      setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch(_){} } }, 1200);
    }
    this._ambient = [];
  }

  _droneLoop(freqs, vol, type = 'sine') {
    const nodes = [];
    const gain  = this._ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this._master);
    gain.gain.setTargetAtTime(vol, this._ctx.currentTime, 1.5);

    for (const f of freqs) {
      const osc = this._ctx.createOscillator();
      osc.type      = type;
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start();
      nodes.push(osc);
    }
    return { gain, nodes };
  }

  _noiseLoop(vol) {
    const bufSize = this._ctx.sampleRate * 2;
    const buf     = this._ctx.createBuffer(1, bufSize, this._ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    const filter = this._ctx.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = 800;
    const gain = this._ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this._master);
    gain.gain.setTargetAtTime(vol, this._ctx.currentTime, 1.0);
    src.connect(filter);
    filter.connect(gain);
    src.start();
    return { gain, nodes: [src] };
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  _sfxSocial(type) {
    const freq = SFX_PITCH[type] ?? 520;
    this._tone(freq, 0.08, 0.18, 'sine');
    setTimeout(() => this._tone(freq * 1.25, 0.06, 0.12, 'sine'), 120);
  }

  _sfxSkillUp() {
    [440, 554, 659, 880].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.07, 0.18, 'sine'), i * 80)
    );
  }

  _sfxCoin() {
    [1047, 1319].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.06, 0.1, 'triangle'), i * 60)
    );
  }

  _sfxThud() {
    this._tone(80, 0.12, 0.25, 'sawtooth');
  }

  _sfxMood(next) {
    const freq = { ecstatic: 880, happy: 660, neutral: 440, sad: 330, miserable: 220 }[next] ?? 440;
    this._tone(freq, 0.04, 0.3, 'sine');
  }

  _sfxThump(freq = 120, vol = 0.12) {
    this._tone(freq, vol, 0.15, 'sawtooth');
  }

  _sfxKnock() {
    [300, 240].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.08, 0.08, 'triangle'), i * 70)
    );
  }

  _tone(freq, vol, dur, type = 'sine') {
    if (!this._ctx || this._muted) return;
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const g   = this._ctx.createGain();
    osc.type            = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this._master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._master) this._master.gain.value = this._volume;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._master) this._master.gain.value = this._muted ? 0 : this._volume;
    return this._muted;
  }
}

export const soundSystem = new SoundSystem();
