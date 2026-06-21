/**
 * GameClock — Sprint 6
 * In-game time: days, hours, minutes.
 * One real second = configurable in-game minutes (default 2 min/sec at 1x speed).
 *
 * Speed multipliers: 0 (paused), 1x, 2x, 5x
 * Emits:
 *   clock:tick        { day, hour, minute, totalMinutes }  — every in-game minute
 *   clock:hourChanged { day, hour }                        — every in-game hour
 *   clock:dayChanged  { day }                              — every in-game day (midnight)
 *   clock:dawn        { day }                              — at in-game 06:00
 *   clock:dusk        { day }                              — at in-game 20:00
 *
 * Serialisable.
 */
import { bus } from './EventBus.js';

const MINS_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const TOTAL_MINS_PER_DAY = MINS_PER_HOUR * HOURS_PER_DAY;

export class GameClock {
  /**
   * @param {number} realSecondsPerGameMinute  default 0.5 (= 2 game-min/real-sec at 1x)
   */
  constructor(realSecondsPerGameMinute = 0.5) {
    this._secPerMin = realSecondsPerGameMinute;
    this._speed     = 1;   // 0 = paused
    this._accum     = 0;   // accumulated real seconds

    // State
    this._day    = 1;
    this._hour   = 8;   // start at 08:00
    this._minute = 0;
    this._totalMinutes = (this._day - 1) * TOTAL_MINS_PER_DAY + this._hour * MINS_PER_HOUR;
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get day()          { return this._day; }
  get hour()         { return this._hour; }
  get minute()       { return this._minute; }
  get totalMinutes() { return this._totalMinutes; }
  get speed()        { return this._speed; }
  get paused()       { return this._speed === 0; }
  get isDay()        { return this._hour >= 6 && this._hour < 20; }
  get isNight()      { return !this.isDay; }

  /** HH:MM string */
  get timeString() {
    return `${String(this._hour).padStart(2,'0')}:${String(this._minute).padStart(2,'0')}`;
  }
  get dayString() { return `Day ${this._day}`; }

  // ── Control ───────────────────────────────────────────────────────────────

  setSpeed(s) {
    this._speed = [0, 1, 2, 5].includes(s) ? s : 1;
    bus.emit('clock:speedChanged', { speed: this._speed });
  }
  pause()   { this.setSpeed(0); }
  resume()  { this.setSpeed(1); }
  toggle()  { this._speed === 0 ? this.resume() : this.pause(); }

  // ── Update (called from GameLoop each frame) ─────────────────────────────

  update(deltaSeconds) {
    if (this._speed === 0) return;
    this._accum += deltaSeconds * this._speed;
    while (this._accum >= this._secPerMin) {
      this._accum -= this._secPerMin;
      this._advanceMinute();
    }
  }

  _advanceMinute() {
    this._minute++;
    this._totalMinutes++;
    if (this._minute >= MINS_PER_HOUR) {
      this._minute = 0;
      const prevHour = this._hour;
      this._hour++;
      bus.emit('clock:hourChanged', { day: this._day, hour: this._hour });
      if (prevHour === 5)  bus.emit('clock:dawn', { day: this._day });
      if (prevHour === 19) bus.emit('clock:dusk', { day: this._day });
      if (this._hour >= HOURS_PER_DAY) {
        this._hour = 0;
        this._day++;
        bus.emit('clock:dayChanged', { day: this._day });
      }
    }
    bus.emit('clock:tick', {
      day: this._day, hour: this._hour,
      minute: this._minute, totalMinutes: this._totalMinutes
    });
  }

  // ── Serialise ─────────────────────────────────────────────────────────────

  serialise() {
    return { day: this._day, hour: this._hour, minute: this._minute,
             totalMinutes: this._totalMinutes, speed: this._speed };
  }

  restore(data) {
    if (!data) return;
    this._day          = data.day          ?? 1;
    this._hour         = data.hour         ?? 8;
    this._minute       = data.minute       ?? 0;
    this._totalMinutes = data.totalMinutes ?? 0;
    this._speed        = data.speed        ?? 1;
  }
}
