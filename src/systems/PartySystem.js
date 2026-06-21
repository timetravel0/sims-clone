/**
 * PartySystem — host a party on the lot with goals and a final score.
 *
 * A party has a host, a guest list, a set of goals tracked from existing
 * simulation events, a sim-time duration, and a final grade (F→A+).
 * Only one party runs at a time.
 *
 * Goals (tracked live):
 *   meals   — N meals served   (sim:objectUsed on fridge/dining_table)
 *   social  — N social chats    (social:interaction)
 *   fun     — guests' avg fun ≥ target (measured at party end)
 *
 * Emits:
 *   party:started  { host, guests, goals, durationSec }
 *   party:progress { goal, progress, target }
 *   party:scored   { score, grade, goals }
 *   party:ended    { score, grade }
 *
 * Transient — not serialised (a party doesn't survive a reload).
 */
import { bus } from '../core/EventBus.js';

const EAT_OBJECTS = new Set(['fridge', 'dining_table']);
const DEFAULT_DURATION_SEC = 60;   // sim-seconds (~6 in-game hours at DAY_DURATION 240)

export class PartySystem {
  /** @param {object} game */
  constructor(game) {
    this._game   = game;
    this._active = null;   // current party state or null

    bus.on('sim:objectUsed', ({ objectType }) => {
      if (this._active && EAT_OBJECTS.has(objectType)) this._bump('meals');
    });
    bus.on('social:interaction', () => {
      if (this._active) this._bump('social');
    });
  }

  get active() { return this._active; }

  /**
   * Throw a party.
   * @param {Sim}   host
   * @param {Sim[]} guests
   * @param {number} durationSec  sim-seconds
   */
  start(host, guests = [], durationSec = DEFAULT_DURATION_SEC) {
    if (this._active) return false;
    if (!host) return false;
    const goals = [
      { id: 'meals',  label: 'Serve 3 meals',          target: 3,  progress: 0 },
      { id: 'social', label: 'Spark 5 conversations',  target: 5,  progress: 0 },
      { id: 'fun',    label: 'Keep guests having fun',  target: 60, progress: 0, atEnd: true },
    ];
    this._active = {
      host,
      guests: guests.filter(Boolean),
      goals,
      elapsed: 0,
      duration: durationSec,
    };
    bus.emit('party:started', { host, guests: this._active.guests, goals, durationSec });
    bus.emit('story:entry', {
      text: `🎉 ${host.name} threw a party for ${this._active.guests.length} guest(s)!`,
      cat: 'positive', category: 'positive',
    });
    return true;
  }

  /** Called each tick with sim-seconds dt. */
  update(dt) {
    if (!this._active) return;
    this._active.elapsed += dt;
    if (this._active.elapsed >= this._active.duration) this._end();
  }

  _bump(goalId, amount = 1) {
    const goal = this._active.goals.find(g => g.id === goalId);
    if (!goal || goal.atEnd || goal.progress >= goal.target) return;
    goal.progress = Math.min(goal.target, goal.progress + amount);
    bus.emit('party:progress', { goal: goal.id, progress: goal.progress, target: goal.target });
  }

  _end() {
    const party = this._active;
    this._active = null;   // clear first so listeners can't re-enter

    // Measure end-of-party goals
    const attendees = [party.host, ...party.guests];
    const funGoal = party.goals.find(g => g.id === 'fun');
    if (funGoal) {
      const vals = attendees.map(s => s?.needs?.get?.('fun') ?? 0);
      const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      funGoal.progress = Math.round(avg);
    }

    // Score: each goal contributes up to 100 pts by completion ratio.
    const ratios = party.goals.map(g => Math.min(1, g.target ? g.progress / g.target : 0));
    const score  = Math.round((ratios.reduce((a, b) => a + b, 0) / party.goals.length) * 100);
    const grade  = score >= 90 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B'
                 : score >= 40 ? 'C'  : score >= 20 ? 'D' : 'F';

    bus.emit('party:scored', { score, grade, goals: party.goals });
    bus.emit('party:ended',  { score, grade });
    bus.emit('story:entry', {
      text: `🎊 ${party.host.name}'s party ended — score ${score}/100 (${grade}).`,
      cat: score >= 60 ? 'positive' : 'drama',
      category: score >= 60 ? 'positive' : 'drama',
    });
    // Reward: a good party lifts everyone's social need.
    if (score >= 60) for (const s of attendees) s?.needs?.restore?.('social', 25);
  }
}
