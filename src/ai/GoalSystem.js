import { bus } from '../core/EventBus.js';

/**
 * GoalSystem — medium-term self-generated objectives per Sim.
 *
 * Goals are generated automatically from:
 *  - Personality traits (ambitious → career goals, outgoing → friendship goals)
 *  - Recent memory patterns (bad memories → avoidance goals)
 *  - Life events (fired → financial recovery goal)
 *
 * A goal has:
 *  { id, type, label, targetId?, deadline, progress, weight, status }
 *
 * status: 'active' | 'completed' | 'failed' | 'abandoned'
 * weight: 0.0–1.0 how much this goal boosts matching affordances
 *
 * Goals interact with UtilityAIPlanner via boost(affordance):
 * if the affordance serves an active goal, score gets +weight*GOAL_BONUS.
 *
 * Max active goals: 3 (prevents goal spam).
 * Deadline in in-game days; expired goals are marked 'failed'.
 */

const GOAL_BONUS  = 8;    // score points per unit of goal weight
const MAX_GOALS   = 3;
const REGEN_COOL  = 120;  // sim-seconds before generating a new goal

export class GoalSystem {
  constructor(sim) {
    this._sim        = sim;
    this._goals      = [];  // Goal[]
    this._regenTimer = 0;
    this._registerListeners();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns bonus score for an affordance that serves an active goal.
   */
  boost(affordance) {
    let total = 0;
    for (const goal of this._goals) {
      if (goal.status !== 'active') continue;
      total += this._matchScore(goal, affordance) * goal.weight * GOAL_BONUS;
    }
    return total;
  }

  /** Tick: countdown deadlines, generate new goals when needed. */
  update(dt, currentDay) {
    // Expire overdue goals
    for (const goal of this._goals) {
      if (goal.status !== 'active') continue;
      if (currentDay > goal.deadline) {
        goal.status = 'failed';
        bus.emit('goal:failed', { simId: this._sim.id, goal });
        bus.emit('story:entry', { text: `${this._sim.name} failed their goal: ${goal.label}`, cat: 'mood' });
      }
    }

    // Prune old non-active goals beyond history of 10
    const finished = this._goals.filter(g => g.status !== 'active');
    if (finished.length > 10) this._goals = [
      ...this._goals.filter(g => g.status === 'active'),
      ...finished.slice(-10),
    ];

    // Try to generate a new goal
    this._regenTimer -= dt;
    if (this._regenTimer <= 0) {
      this._regenTimer = REGEN_COOL;
      this._tryGenerate(currentDay);
    }
  }

  activeGoals()    { return this._goals.filter(g => g.status === 'active'); }
  allGoals()       { return [...this._goals]; }

  /** Mark a goal complete (called by CareerSystem, RelationshipGraph, etc.) */
  complete(goalType, targetId) {
    const goal = this._goals.find(g =>
      g.status === 'active' && g.type === goalType &&
      (g.targetId == null || g.targetId === targetId)
    );
    if (!goal) return;
    goal.status   = 'completed';
    goal.progress = 1;
    bus.emit('goal:completed', { simId: this._sim.id, goal });
    bus.emit('story:entry', { text: `${this._sim.name} achieved their goal: ${goal.label} 🎯`, cat: 'positive' });
  }

  serialise()  { return this._goals.map(g => ({ ...g })); }
  restore(arr) { this._goals = arr.map(g => ({ ...g })); }

  // ── Goal generation ───────────────────────────────────────────────────────

  _tryGenerate(currentDay) {
    const active = this.activeGoals();
    if (active.length >= MAX_GOALS) return;

    const candidates = this._buildCandidates(currentDay);
    if (candidates.length === 0) return;

    // Don't repeat an already-active type
    const filtered = candidates.filter(c => !active.some(a => a.type === c.type));
    if (filtered.length === 0) return;

    // Weighted random pick
    const goal = this._weightedPick(filtered);
    this._goals.push(goal);
    bus.emit('goal:created', { simId: this._sim.id, goal });
    bus.emit('story:entry', { text: `${this._sim.name} sets a new goal: ${goal.label}`, cat: 'neutral' });
  }

  _buildCandidates(currentDay) {
    const p   = this._sim.personality;
    const out = [];
    const day = currentDay ?? 0;

    // Career advancement (ambitious Sims generate more often)
    if (p.ambitious > 0) {
      out.push({
        id:       this._uid(),
        type:     'career_advance',
        label:    'Get a promotion',
        deadline: day + 5,
        progress: 0,
        weight:   0.6 + p.ambitious * 0.4,
        status:   'active',
      });
    }

    // Make a friend (outgoing Sims)
    if (p.outgoing > -0.2) {
      const others = window._game?.sims?.filter(s => s.id !== this._sim.id) ?? [];
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        out.push({
          id:       this._uid(),
          type:     'make_friend',
          label:    `Befriend ${target.name}`,
          targetId: target.id,
          deadline: day + 4,
          progress: 0,
          weight:   0.5 + p.outgoing * 0.4,
          status:   'active',
        });
      }
    }

    // Improve a skill
    out.push({
      id:       this._uid(),
      type:     'skill_up',
      label:    'Improve a skill',
      deadline: day + 3,
      progress: 0,
      weight:   0.4 + Math.abs(p.ambitious) * 0.3,
      status:   'active',
    });

    // Relaxation goal (neurotic or tired Sims)
    const energy = this._sim.needs?.get('energy') ?? 80;
    if (p.neurotic > 0.2 || energy < 40) {
      out.push({
        id:       this._uid(),
        type:     'rest',
        label:    'Get proper rest',
        deadline: day + 2,
        progress: 0,
        weight:   0.5 + p.neurotic * 0.3,
        status:   'active',
      });
    }

    // Avoidance goal (recent negative memories with a specific Sim)
    const memSys = window._game?.memorySystem;
    if (memSys) {
      const others = window._game?.sims?.filter(s => s.id !== this._sim.id) ?? [];
      for (const other of others) {
        const bias = memSys.biasWith(this._sim.id, other.id);
        if (bias < -0.4) {
          out.push({
            id:       this._uid(),
            type:     'avoid_sim',
            label:    `Avoid ${other.name}`,
            targetId: other.id,
            deadline: day + 7,
            progress: 0,
            weight:   Math.abs(bias) * 0.8,
            status:   'active',
          });
          break; // only one avoidance goal at a time
        }
      }
    }

    return out;
  }

  // ── Affordance matching ───────────────────────────────────────────────────

  _matchScore(goal, affordance) {
    switch (goal.type) {
      case 'career_advance':
        // Boost skill-building objects and work-related actions
        return affordance.skillGain ? 0.8 : 0;
      case 'make_friend':
        if (affordance.targetType !== 'sim') return 0;
        if (affordance.target?.id === goal.targetId) return 1.0;
        return (affordance.verb === 'chat' || affordance.verb === 'compliment') ? 0.3 : 0;
      case 'skill_up':
        return affordance.skillGain ? 0.6 : 0;
      case 'rest':
        return (affordance.verb === 'sleep' || affordance.verb === 'sit') ? 0.7 : 0;
      case 'avoid_sim':
        // Negative score: penalises interactions with the avoided Sim
        if (affordance.targetType === 'sim' && affordance.target?.id === goal.targetId) return -1.2;
        return 0;
      default:
        return 0;
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  _registerListeners() {
    bus.on('career:levelUp', ({ simId }) => {
      if (simId !== this._sim.id) return;
      this.complete('career_advance');
    });

    bus.on('social:interaction', ({ idA, idB, score }) => {
      if (idA !== this._sim.id) return;
      if (score > 50) this.complete('make_friend', idB);
    });

    bus.on('skill:levelUp', ({ simId }) => {
      if (simId !== this._sim.id) return;
      this.complete('skill_up');
    });

    bus.on('sim:moodChanged', ({ simId, to }) => {
      if (simId !== this._sim.id) return;
      if (to === 'happy' || to === 'ecstatic') this.complete('rest');
    });
  }

  _uid()          { return `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
  _weightedPick(arr) {
    const total = arr.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of arr) { r -= c.weight; if (r <= 0) return c; }
    return arr[arr.length - 1];
  }
}
