import { bus }         from '../core/EventBus.js';
import { GameContext } from '../core/GameContext.js';

/**
 * GoalSystem — obiettivi a medio termine auto-generati per Sim.
 *
 * Modifiche rispetto alla versione precedente:
 *  - Usa GameContext al posto di window._game
 *  - Aggiunto destroy() per cleanup dei listener (fix memory leak)
 *  - make_friend: target scelto in base a MemorySystem.biasWith() (valenza positiva)
 *    invece di Math.random(); non rigenera lo stesso goal se fallito di recente
 */

const GOAL_BONUS  = 8;
const MAX_GOALS   = 3;
const REGEN_COOL  = 120;

const SELF_CARE_VERBS    = new Set(['sleep', 'eat', 'use_toilet', 'shower', 'relax', 'watch_tv', 'read', 'study', 'play_chess', 'play_piano', 'soak', 'dine']);
const FAMILY_CARE_VERBS  = new Set(['comfort', 'offer_help', 'hug', 'chat', 'compliment', 'apologize', 'forgive']);
const HARMFUL_FAMILY_VERBS = new Set(['argue', 'insult', 'confront', 'avoid']);

export class GoalSystem {
  constructor(sim) {
    this._sim        = sim;
    this._goals      = [];
    this._regenTimer = 0;
    this._listeners  = [];   // per cleanup in destroy()
    this._registerListeners();
  }

  // ── Public API ─────────────────────────────────────────────────────────────────────

  boost(affordance) {
    let total = 0;
    for (const goal of this._goals) {
      if (goal.status !== 'active') continue;
      total += this._matchScore(goal, affordance) * goal.weight * GOAL_BONUS;
    }
    return total;
  }

  update(dt, currentDay) {
    for (const goal of this._goals) {
      if (goal.status !== 'active') continue;
      if (currentDay > goal.deadline) {
        goal.status = 'failed';
        bus.emit('goal:failed', { simId: this._sim.id, goal });
        bus.emit('story:entry', { text: `${this._sim.name} non ha raggiunto l'obiettivo: ${goal.label}`, cat: 'mood' });
      }
    }

    const finished = this._goals.filter(g => g.status !== 'active');
    if (finished.length > 10) this._goals = [
      ...this._goals.filter(g => g.status === 'active'),
      ...finished.slice(-10),
    ];

    this._regenTimer -= dt;
    if (this._regenTimer <= 0) {
      this._regenTimer = REGEN_COOL;
      this._tryGenerate(currentDay);
    }
  }

  activeGoals() { return this._goals.filter(g => g.status === 'active'); }
  allGoals()    { return [...this._goals]; }

  complete(goalType, targetId) {
    const goal = this._goals.find(g =>
      g.status === 'active' && g.type === goalType &&
      (g.targetId == null || g.targetId === targetId)
    );
    if (!goal) return;
    goal.status   = 'completed';
    goal.progress = 1;
    bus.emit('goal:completed', { simId: this._sim.id, goal });
    bus.emit('story:entry', { text: `${this._sim.name} ha raggiunto il suo obiettivo: ${goal.label} 🎯`, cat: 'positive' });
  }

  serialise()  { return this._goals.map(g => ({ ...g })); }
  restore(arr) { this._goals = arr.map(g => ({ ...g })); }

  /** Rimuove tutti i listener dell'EventBus (fix memory leak). */
  destroy() {
    for (const { event, handler } of this._listeners) bus.off(event, handler);
    this._listeners = [];
  }

  // ── Goal generation ───────────────────────────────────────────────────────────

  _tryGenerate(currentDay) {
    const active = this.activeGoals();
    if (active.length >= MAX_GOALS) return;

    const candidates = this._buildCandidates(currentDay);
    if (candidates.length === 0) return;

    const filtered = candidates.filter(c => !active.some(a => a.type === c.type));
    if (filtered.length === 0) return;

    const goal = this._weightedPick(filtered);
    this._goals.push(goal);
    bus.emit('goal:created', { simId: this._sim.id, goal });
    bus.emit('story:entry', { text: `${this._sim.name} si pone un nuovo obiettivo: ${goal.label}`, cat: 'neutral' });
  }

  _buildCandidates(currentDay) {
    const p   = this._sim.personality;
    const out = [];
    const day = currentDay ?? 0;
    const wellbeing = this._sim.brain?.wellbeing?.evaluate?.();

    out.push({
      id:       this._uid(),
      type:     'be_happy',
      label:    'Sentirsi soddisfatto e felice',
      deadline: day + 2,
      progress: 0,
      weight:   Math.min(1, 0.45 + (wellbeing?.ownDrive ?? 0.35) * 0.55 + Math.max(0, p.neurotic ?? 0) * 0.15),
      status:   'active',
    });

    const familyMembers = this._householdOthers();
    if (familyMembers.length > 0) {
      out.push({
        id:       this._uid(),
        type:     'support_family',
        label:    'Aiutare la famiglia a stare meglio',
        deadline: day + 3,
        progress: 0,
        weight:   Math.min(1, 0.35 + (wellbeing?.familyDrive ?? 0.25) * 0.65 + Math.max(0, p.nice ?? 0) * 0.2),
        status:   'active',
      });
    }

    if (p.ambitious > 0) {
      out.push({
        id:       this._uid(),
        type:     'career_advance',
        label:    'Ottenere una promozione',
        deadline: day + 5,
        progress: 0,
        weight:   0.6 + p.ambitious * 0.4,
        status:   'active',
      });
    }

    // make_friend: target scelto tramite MemorySystem (valenza positiva)
    // Non rigenera lo stesso target se fallito recentemente
    if (p.outgoing > -0.2) {
      const friendTarget = this._pickFriendTarget();
      if (friendTarget) {
        out.push({
          id:       this._uid(),
          type:     'make_friend',
          label:    `Fare amicizia con ${friendTarget.name}`,
          targetId: friendTarget.id,
          deadline: day + 4,
          progress: 0,
          weight:   0.5 + p.outgoing * 0.4,
          status:   'active',
        });
      }
    }

    out.push({
      id:       this._uid(),
      type:     'skill_up',
      label:    'Migliorare una competenza',
      deadline: day + 3,
      progress: 0,
      weight:   0.4 + Math.abs(p.ambitious) * 0.3,
      status:   'active',
    });

    const energy = this._sim.needs?.get('energy') ?? 80;
    if (p.neurotic > 0.2 || energy < 40) {
      out.push({
        id:       this._uid(),
        type:     'rest',
        label:    'Riposarsi adeguatamente',
        deadline: day + 2,
        progress: 0,
        weight:   0.5 + p.neurotic * 0.3,
        status:   'active',
      });
    }

    const memSys = GameContext.memorySystem;
    if (memSys) {
      const others = GameContext.sims(this._sim.id);
      for (const other of others) {
        const bias = memSys.biasWith(this._sim.id, other.id);
        if (bias < -0.4) {
          out.push({
            id:       this._uid(),
            type:     'avoid_sim',
            label:    `Evitare ${other.name}`,
            targetId: other.id,
            deadline: day + 7,
            progress: 0,
            weight:   Math.abs(bias) * 0.8,
            status:   'active',
          });
          break;
        }
      }
    }

    return out;
  }

  /**
   * Sceglie il target più adatto per un goal make_friend:
   *  1. Preferisce Sim con valenza positiva nel MemorySystem
   *  2. Esclude Sim per cui un goal make_friend è già fallito di recente
   *  3. Fallback: Sim casuale se la memoria è assente
   */
  _pickFriendTarget() {
    const others = GameContext.sims(this._sim.id).filter(s => !s._isVisitor && !s._atWork);
    if (others.length === 0) return null;

    // Escludi target di goal falliti negli ultimi 5 goal conclusi
    const recentlyFailed = new Set(
      this._goals
        .filter(g => g.status === 'failed' && g.type === 'make_friend')
        .slice(-5)
        .map(g => g.targetId)
    );

    const candidates = others.filter(s => !recentlyFailed.has(s.id));
    if (candidates.length === 0) return others[Math.floor(Math.random() * others.length)];

    // Ordina per valenza positiva nel MemorySystem (se disponibile)
    const memSys = this._sim.brain?.memory;
    if (memSys) {
      const scored = candidates.map(s => ({ sim: s, bias: memSys.biasWith(s.id) }));
      scored.sort((a, b) => b.bias - a.bias);
      // Scegli tra i top-3 con un po' di casualità
      const pool = scored.slice(0, Math.min(3, scored.length));
      return pool[Math.floor(Math.random() * pool.length)].sim;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ── Affordance matching ────────────────────────────────────────────────────────

  _matchScore(goal, affordance) {
    switch (goal.type) {
      case 'be_happy':
        if (affordance.targetType === 'furniture') return SELF_CARE_VERBS.has(affordance.verb) ? 0.9 : 0.25;
        if (affordance.targetType === 'sim') return FAMILY_CARE_VERBS.has(affordance.verb) ? 0.35 : 0;
        return 0;
      case 'support_family':
        if (affordance.targetType !== 'sim') return 0.15;
        if (!this._isHouseholdMember(affordance.target?.id)) return 0;
        if (FAMILY_CARE_VERBS.has(affordance.verb)) return 1.0;
        if (HARMFUL_FAMILY_VERBS.has(affordance.verb)) return -1.3;
        return 0.2;
      case 'career_advance':
        return affordance.skillGain ? 0.8 : 0;
      case 'make_friend':
        if (affordance.targetType !== 'sim') return 0;
        if (affordance.target?.id === goal.targetId) return 1.0;
        return (affordance.verb === 'chat' || affordance.verb === 'compliment') ? 0.3 : 0;
      case 'skill_up':
        return affordance.skillGain ? 0.6 : 0;
      case 'rest':
        return (affordance.verb === 'sleep' || affordance.verb === 'sit' || affordance.verb === 'relax') ? 0.7 : 0;
      case 'avoid_sim':
        if (affordance.targetType === 'sim' && affordance.target?.id === goal.targetId) {
          if (affordance.verb === 'avoid') return 1.5;  // encourage actual avoidance
          return -3.0;  // strongly penalise positive contact with target
        }
        return 0;
      default:
        return 0;
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────────────────

  _on(event, handler) {
    bus.on(event, handler);
    this._listeners.push({ event, handler });
  }

  _registerListeners() {
    this._on('career:levelUp', ({ simId }) => {
      if (simId !== this._sim.id) return;
      this.complete('career_advance');
    });

    this._on('social:interaction', ({ idA, idB, score, accepted, type }) => {
      if (idA !== this._sim.id) return;
      if (score > 50) this.complete('make_friend', idB);
      if (accepted && FAMILY_CARE_VERBS.has(type) && this._isHouseholdMember(idB)) this.complete('support_family');
    });

    this._on('skill:levelUp', ({ simId }) => {
      if (simId !== this._sim.id) return;
      this.complete('skill_up');
    });

    this._on('sim:moodChanged', ({ simId, to }) => {
      if (simId !== this._sim.id) return;
      if (to === 'happy' || to === 'ecstatic') {
        this.complete('rest');
        this.complete('be_happy');
      }
    });
  }

  _householdOthers() {
    return GameContext.sims(this._sim.id)
      .filter(s => !s._isVisitor && (GameContext.population?.isHouseholdMember?.(s.id) ?? true));
  }

  _isHouseholdMember(id) {
    if (!id) return false;
    return !!GameContext.population?.isHouseholdMember?.(id);
  }

  _uid()         { return `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
  _weightedPick(arr) {
    const total = arr.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of arr) { r -= c.weight; if (r <= 0) return c; }
    return arr[arr.length - 1];
  }
}
