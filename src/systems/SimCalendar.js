/**
 * SimCalendar — week/day clock and recurring calendar events.
 *
 * Maps DayNightCycle 0..1 → hour 0-24 and day-of-week 0-6 (Mon-Sun).
 * Detects day rollover to advance the week counter.
 *
 * Built-in recurring events:
 *   Mon 09:00  — Work week starts
 *   Fri 18:00  — Friday night social (+15 social for all Sims)
 *   Sun 12:00  — Sunday gathering (+10 social, +8 fun)
 *
 * Custom events can be added via addRecurringEvent().
 */
import { bus } from '../core/EventBus.js';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const DAY_LENGTH_SECONDS = 120; // real seconds per simulated day at 1× speed

export class SimCalendar {
  constructor() {
    this.week       = 1;
    this.dayOfWeek  = 0;   // 0=Mon … 6=Sun
    this.hour       = 8;
    this._prevTime  = -1;
    this._firedToday = new Set();
    this._recurring  = [];
    this._registerBuiltins();
  }

  get dayName()   { return DAYS[this.dayOfWeek]; }
  get isWeekend() { return this.dayOfWeek >= 5; }

  /**
   * @param {number} dt        scaled dt seconds
   * @param {number} dayTime   DayNightCycle.time 0..1
   * @param {Array}  sims
   */
  update(dt, dayTime, sims) {
    this.hour = dayTime * 24;
    const prev = this._prevTime;
    this._prevTime = dayTime;
    if (prev >= 0 && dayTime < prev - 0.3) this._onNewDay(sims);
    this._checkEvents(sims);
  }

  _onNewDay(sims) {
    this._firedToday.clear();
    this.dayOfWeek = (this.dayOfWeek + 1) % 7;
    if (this.dayOfWeek === 0) this.week++;
    bus.emit('calendar:newDay', { week: this.week, dayOfWeek: this.dayOfWeek, dayName: this.dayName });
    bus.emit('story:entry', { text: `📅 ${this.dayName}, Week ${this.week}.` });
  }

  _checkEvents(sims) {
    for (const ev of this._recurring) {
      if (ev.dayOfWeek !== this.dayOfWeek) continue;
      if (this._firedToday.has(ev.id)) continue;
      if (this.hour >= ev.hour) {
        this._firedToday.add(ev.id);
        ev.handler(sims);
        bus.emit('calendar:event', { id: ev.id, label: ev.label, week: this.week, day: this.dayName });
      }
    }
  }

  addRecurringEvent({ id, label, dayOfWeek, hour, handler }) {
    this._recurring.push({ id, label, dayOfWeek, hour, handler });
  }

  _registerBuiltins() {
    this.addRecurringEvent({
      id: 'work_week_start', label: 'Work Week Begins',
      dayOfWeek: 0, hour: 9,
      handler: sims => {
        for (const s of sims) {
          if (s.career?.track !== 'unemployed') s.showBubble?.('⏰ Work!', 2);
        }
      },
    });
    this.addRecurringEvent({
      id: 'friday_social', label: 'Friday Night Social',
      dayOfWeek: 4, hour: 18,
      handler: sims => {
        for (const s of sims) s.needs?.modify('social', 15);
        bus.emit('story:entry', { text: '🎉 Friday night! Everyone feels more social.' });
      },
    });
    this.addRecurringEvent({
      id: 'sunday_gathering', label: 'Sunday Gathering',
      dayOfWeek: 6, hour: 12,
      handler: sims => {
        for (const s of sims) { s.needs?.modify('social', 10); s.needs?.modify('fun', 8); }
        bus.emit('story:entry', { text: '👨‍👩‍👧 Sunday gathering — bonds strengthen.' });
      },
    });
  }

  serialise() {
    return { week: this.week, dayOfWeek: this.dayOfWeek, hour: this.hour, prevTime: this._prevTime };
  }
  restore(d) {
    if (!d) return;
    this.week      = d.week      ?? 1;
    this.dayOfWeek = d.dayOfWeek ?? 0;
    this.hour      = d.hour      ?? 8;
    this._prevTime = d.prevTime  ?? -1;
    this._firedToday.clear();
  }
}
