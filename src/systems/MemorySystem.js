import { bus } from '../core/EventBus.js';

/**
 * MemorySystem — episodic memory store shared across all Sims.
 *
 * Each memory:
 *   { id, simId, type, data, intensity, valence, gameTime, decayRate }
 *
 * type      : 'social'|'need_crisis'|'mood_peak'|'life_event'|'god_action'
 * intensity : 0.0–1.0  (vividness, fades over time)
 * valence   : -1.0–+1.0 (negative ↔ positive)
 * decayRate : intensity units per second
 *
 * Behavioural effects:
 *   NeedDrivenPlanner — avoids furniture linked to negative memories
 *   SocialAction      — biases interaction type toward/away from specific Sims
 *   SimEmotions       — secondary emotions emerge from memory clusters
 */

let _memId = 0;

export class MemorySystem {
  constructor() {
    this._memories = new Map(); // simId → Memory[]
    this._registerListeners();
  }

  record(simId, type, data, intensity, valence, decayRate = 0.002) {
    if (!this._memories.has(simId)) this._memories.set(simId, []);
    const mem = {
      id:        ++_memId,
      simId,
      type,
      data:      { ...data },
      intensity: Math.min(1, Math.max(0, intensity)),
      valence:   Math.min(1, Math.max(-1, valence)),
      gameTime:  window._game?.clock?.hour ?? 0,
      decayRate,
    };
    const list = this._memories.get(simId);
    list.push(mem);
    if (list.length > 60) {
      list.sort((a, b) => b.intensity - a.intensity);
      list.splice(60);
    }
    bus.emit('memory:recorded', { simId, memory: mem });
    return mem;
  }

  of(simId) {
    return (this._memories.get(simId) || []).sort((a, b) => b.intensity - a.intensity);
  }

  with(simId, otherId) {
    return this.of(simId).filter(m =>
      m.data.otherId === otherId || m.data.idA === otherId || m.data.idB === otherId
    );
  }

  biasWith(simId, otherId) {
    const mems    = this.with(simId, otherId);
    if (mems.length === 0) return 0;
    const weighted = mems.reduce((s, m) => s + m.valence * m.intensity, 0);
    const totalW   = mems.reduce((s, m) => s + m.intensity, 0);
    return totalW > 0 ? Math.max(-1, Math.min(1, weighted / totalW)) : 0;
  }

  update(dt) {
    for (const list of this._memories.values()) {
      for (const mem of list) mem.intensity = Math.max(0, mem.intensity - mem.decayRate * dt);
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].intensity <= 0) list.splice(i, 1);
      }
    }
  }

  _registerListeners() {
    bus.on('social:interaction', ({ idA, idB, nameA, nameB, type, score, delta }) => {
      const valence   = delta > 0 ? Math.min(1, delta / 20) : Math.max(-1, delta / 20);
      const intensity = Math.min(1, Math.abs(delta) / 20 + 0.2);
      this.record(idA, 'social', { otherId: idB, otherName: nameB, type, score }, intensity, valence);
      this.record(idB, 'social', { otherId: idA, otherName: nameA, type, score }, intensity * 0.6, valence * 0.5);
    });

    bus.on('sim:moodChanged', ({ simId, to }) => {
      const valence   = ['ecstatic','happy'].includes(to) ? 0.8 : -0.7;
      const intensity = (to === 'ecstatic' || to === 'miserable') ? 0.9 : 0.4;
      this.record(simId, 'mood_peak', { tier: to }, intensity, valence, 0.001);
    });

    // Need crisis via custom DOM event (fired by NeedDrivenPlanner)
    window.addEventListener('sim:need:crisis', ({ detail: { simId, need, value } }) => {
      bus.emit('need:crisis', { simId, need, value });
      const intensity = Math.min(1, 1 - value / 15);
      this.record(simId, 'need_crisis', { need, value }, intensity, -0.6, 0.001);
    });

    bus.on('life:event', ({ simId, simName, type, valence }) => {
      if (!simId) return;
      const game = window._game;
      const sims = game?.sims || [];
      for (const sim of sims) {
        if (sim.id === simId) continue;
        const relBias = Math.max(0.35, Math.abs(valence ?? 0.5) * 0.55);
        this.record(sim.id, 'life_event', {
          type,
          otherId: simId,
          otherName: simName,
        }, relBias, (valence ?? 0) * 0.55, 0.001);
      }
    });
  }

  serialise() {
    const out = {};
    for (const [id, list] of this._memories) out[id] = list.map(m => ({ ...m }));
    return out;
  }

  restore(data) {
    this._memories.clear();
    for (const [id, list] of Object.entries(data)) this._memories.set(id, list.map(m => ({ ...m })));
  }
}

export const memorySystem = new MemorySystem();
