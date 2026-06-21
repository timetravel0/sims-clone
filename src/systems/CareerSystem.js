/**
 * CareerSystem — career tracks, levels, salary and skill growth.
 *
 * Tracks: unemployed | artist | scientist | chef | athlete | programmer
 * Levels: 1-10, advancing via XP gained at end of each work shift.
 * Skills: creativity | charisma | logic | focus | cooking | fitness  (0-100)
 *
 * Work shift: simHour 9-17. On shift end the Sim gains XP and salary bonus.
 * Skills trained via sim.career.trainSkill(name, amount) from SkillAction.
 */
import { bus } from '../core/EventBus.js';

export const CAREER_TRACKS = {
  unemployed: { label: 'Unemployed', emoji: '🏠', salaryBase: 0,  skills: [] },
  artist:     { label: 'Artist',     emoji: '🎨', salaryBase: 40, skills: ['creativity', 'charisma'] },
  scientist:  { label: 'Scientist',  emoji: '🔬', salaryBase: 70, skills: ['logic', 'focus'] },
  chef:       { label: 'Chef',       emoji: '🍳', salaryBase: 50, skills: ['cooking', 'creativity'] },
  athlete:    { label: 'Athlete',    emoji: '🏃', salaryBase: 60, skills: ['fitness', 'charisma'] },
  programmer: { label: 'Programmer', emoji: '💻', salaryBase: 80, skills: ['logic', 'focus'] },
};

export const ALL_SKILLS = ['creativity', 'charisma', 'logic', 'focus', 'cooking', 'fitness'];

const SHIFT_START = 9;
const SHIFT_END   = 17;

export class SimCareer {
  /** @param {import('../entities/Sim.js').Sim} sim */
  constructor(sim, track = 'unemployed') {
    this._sim       = sim;
    this.track      = track;
    this.level      = 1;
    this._xp        = 0;
    this._salary    = CAREER_TRACKS[track].salaryBase;
    this.atWork     = false;
    this.skills     = {};
    for (const s of ALL_SKILLS) this.skills[s] = 0;
  }

  get trackInfo() { return CAREER_TRACKS[this.track]; }
  get salary()    { return this._salary; }

  /** Called from Game._update once per sim per tick */
  update(dt, simHour) {
    if (this.track === 'unemployed') return;
    const inShift = simHour >= SHIFT_START && simHour < SHIFT_END;
    if (inShift && !this.atWork) {
      this.atWork = true;
      bus.emit('career:workStart', { simId: this._sim.id, simName: this._sim.name, track: this.track });
      bus.emit('story:entry', { text: `💼 ${this._sim.name} heads to work as ${this.trackInfo.label}.` });
    }
    if (!inShift && this.atWork) {
      this.atWork = false;
      this._endShift();
    }
  }

  _endShift() {
    const track    = CAREER_TRACKS[this.track];
    const skillAvg = track.skills.length
      ? track.skills.reduce((s, k) => s + (this.skills[k] || 0), 0) / track.skills.length
      : 50;
    this._gainXP(10 + skillAvg * 0.3);
    if (this._sim.needs?.modify) this._sim.needs.modify('status', this._salary * 0.1);
    bus.emit('career:workEnd', { simId: this._sim.id, simName: this._sim.name, level: this.level });
    bus.emit('story:entry', { text: `🏠 ${this._sim.name} comes home from work (Level ${this.level} ${this.trackInfo.label}).` });
  }

  _gainXP(amount) {
    const required = 100 + this.level * 50;
    this._xp += amount;
    if (this._xp >= required && this.level < 10) {
      this._xp -= required;
      this.level += 1;
      this._salary = Math.round(CAREER_TRACKS[this.track].salaryBase * (1 + (this.level - 1) * 0.15));
      bus.emit('career:promotion', {
        simId: this._sim.id, simName: this._sim.name,
        track: this.track, level: this.level, salary: this._salary,
      });
      bus.emit('story:entry', { text: `🎉 ${this._sim.name} got promoted to Level ${this.level} ${this.trackInfo.label}! Salary: §${this._salary}/day.` });
    }
  }

  /** Train a skill by amount (0-10). Called from SkillAction. */
  trainSkill(skill, amount) {
    if (!(skill in this.skills)) return;
    this.skills[skill] = Math.min(100, this.skills[skill] + amount);
    bus.emit('career:skillTrained', { simId: this._sim.id, simName: this._sim.name, skill, value: this.skills[skill] });
  }

  /** Change career track — resets level/xp, keeps skills. */
  changeTrack(track) {
    if (!(track in CAREER_TRACKS)) return;
    const old = this.track;
    this.track   = track;
    this.level   = 1;
    this._xp     = 0;
    this._salary = CAREER_TRACKS[track].salaryBase;
    this.atWork  = false;
    bus.emit('career:trackChanged', { simId: this._sim.id, simName: this._sim.name, from: old, to: track });
  }

  serialise() {
    return { track: this.track, level: this.level, xp: this._xp, skills: { ...this.skills }, atWork: false };
  }

  restore(d) {
    if (!d) return;
    this.track   = d.track  ?? this.track;
    this.level   = d.level  ?? 1;
    this._xp     = d.xp     ?? 0;
    this.skills  = { ...this.skills, ...(d.skills ?? {}) };
    this._salary = Math.round(CAREER_TRACKS[this.track].salaryBase * (1 + (this.level - 1) * 0.15));
    this.atWork  = false;
  }
}
