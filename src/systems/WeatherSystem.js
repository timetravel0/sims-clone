/**
 * WeatherSystem — Sprint 4
 * Cycles through weather states: sunny, cloudy, rainy, stormy, foggy.
 * Affects:
 *   - Sim mood modifier (fun−, comfort−/+ depending on trait)
 *   - Ambient light colour & intensity (via EventBus → DayNightCycle)
 *   - Outdoor tile walkability penalty (stormy blocks outside tiles)
 * Emits: weather:changed { prev, next, intensity }
 */
import { bus } from '../core/EventBus.js';

export const WEATHER_STATES = ['sunny', 'cloudy', 'rainy', 'stormy', 'foggy'];

// Duration range in sim-minutes for each state
const DURATION = {
  sunny:  [120, 360],
  cloudy:  [60, 180],
  rainy:   [30, 120],
  stormy:  [15,  60],
  foggy:   [20,  80],
};

// Mood delta applied to needs each sim-minute
export const WEATHER_MOOD = {
  sunny:  { fun:  0.02, energy:  0.01 },
  cloudy: { fun: -0.01 },
  rainy:  { fun: -0.02, comfort: -0.01 },
  stormy: { fun: -0.04, comfort: -0.02, energy: -0.01 },
  foggy:  { fun: -0.01, social:  -0.01 },
};

// Light adjustments {color hex, intensity multiplier}
export const WEATHER_LIGHT = {
  sunny:  { skyColor: 0x87ceeb, mult: 1.0 },
  cloudy: { skyColor: 0xb0b8c8, mult: 0.7 },
  rainy:  { skyColor: 0x6a7a8a, mult: 0.5 },
  stormy: { skyColor: 0x3a3d44, mult: 0.3 },
  foggy:  { skyColor: 0xc8cdd4, mult: 0.6 },
};

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

export class WeatherSystem {
  constructor() {
    this.current   = 'sunny';
    this.intensity = 1.0;          // 0–1 within current state
    this._timer    = 0;            // sim-minutes elapsed in current state
    this._duration = randBetween(...DURATION.sunny);
    this._transitioning = false;
  }

  /** dt in real seconds, speed multiplied upstream */
  update(dtSeconds) {
    // 1 sim-minute = 60 real-seconds at 1× speed
    const dtSimMin = dtSeconds / 60;
    this._timer += dtSimMin;

    // Update intensity (0→1 over first 20% of duration, 1 over middle, 1→0 last 20%)
    const frac = this._timer / this._duration;
    if (frac < 0.2)       this.intensity = frac / 0.2;
    else if (frac > 0.8)  this.intensity = (1 - frac) / 0.2;
    else                  this.intensity = 1.0;
    this.intensity = Math.max(0, Math.min(1, this.intensity));

    if (this._timer >= this._duration) {
      this._transition();
    }

    // Emit light update every second
    bus.emit('weather:lightUpdate', {
      state: this.current,
      intensity: this.intensity,
      light: WEATHER_LIGHT[this.current],
    });
  }

  _transition() {
    const prev = this.current;
    // Weighted next state (stormy rare)
    const weights = { sunny: 30, cloudy: 25, rainy: 20, stormy: 5, foggy: 10 };
    const pool = [];
    for (const [s, w] of Object.entries(weights)) {
      if (s !== prev) for (let i = 0; i < w; i++) pool.push(s);
    }
    const next = pool[Math.floor(Math.random() * pool.length)];

    this.current   = next;
    this._timer    = 0;
    this._duration = randBetween(...DURATION[next]);
    this.intensity = 0;

    bus.emit('weather:changed', { prev, next, intensity: 0 });
  }

  /** Returns mood deltas for the current weather (per sim-minute) */
  getMoodDeltas() {
    const base = WEATHER_MOOD[this.current] ?? {};
    const scaled = {};
    for (const [k, v] of Object.entries(base)) {
      scaled[k] = v * this.intensity;
    }
    return scaled;
  }

  /** True when outdoors movement should be penalised */
  isOutdoorPenalty() {
    return this.current === 'stormy';
  }

  serialise() {
    return {
      current: this.current,
      intensity: this.intensity,
      timer: this._timer,
      duration: this._duration,
    };
  }

  restore(data) {
    if (!data) return;
    this.current    = data.current    ?? 'sunny';
    this.intensity  = data.intensity  ?? 1.0;
    this._timer     = data.timer      ?? 0;
    this._duration  = data.duration   ?? 180;
  }
}

export const weatherSystem = new WeatherSystem();
