import { bus }         from '../core/EventBus.js';
import { GameContext } from '../core/GameContext.js';

/**
 * SocialLearning — observational learning between Sims in the same lot.
 *
 * A Sim observes what happens to *other* Sims and updates its own
 * ExperientialBias accordingly, at a reduced weight (observation factor).
 *
 * Mechanisms:
 *  1. Object use observation — if Sim A watches Sim B use object X and B's
 *     mood improves, A gains a small positive bias toward X.
 *  2. Social conflict contagion — if A witnesses B insult C, A's bias toward
 *     B decreases slightly (bystander effect).
 *  3. Social bonding contagion — if A witnesses B and C hugging, A gains a
 *     small curiosity bias toward interacting with both B and C.
 *  4. Gossip propagation — after an intense life event (promotion, firing,
 *     heartbreak), nearby Sims gain a memory-derived bias toward that topic
 *     in their own interactions.
 *
 * Observation factor: 0.25 (one quarter of direct experience weight).
 * Proximity gate: only observe Sims within VIEW_RADIUS tiles.
 */

const OBS_FACTOR   = 0.25;
const VIEW_RADIUS  = 8;

export class SocialLearning {
  /**
   * @param {object} sim        — the observing Sim
   * @param {object} expBias    — the Sim's ExperientialBias instance
   */
  constructor(sim, expBias) {
    this._sim      = sim;
    this._bias     = expBias;
    this._handlers = [];
    this._registerListeners();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _registerListeners() {
    // 1. Object use with mood outcome
    this._on('object:used', ({ actorId, furnitureType, moodDelta }) => {
      if (actorId === this._sim.id)     return; // own actions handled by ExperientialBias
      if (!this._inRange(actorId))      return;
      if (Math.abs(moodDelta) < 5)      return; // only noticeable changes

      // Synthesise a lightweight affordance proxy
      const synthetic = {
        verb:     'use',
        target:   { id: furnitureType },
        utility:  { fun: moodDelta > 0 ? 5 : -5 },
      };
      const biasDelta = (moodDelta / 20) * OBS_FACTOR;
      this._bias.setRaw(`use:${furnitureType}`, biasDelta);
    });

    // 2. Social conflict witnessed
    this._on('social:interaction', ({ idA, idB, type, delta }) => {
      if (idA === this._sim.id || idB === this._sim.id) return;
      if (!this._inRange(idA) && !this._inRange(idB))   return;
      if (type !== 'insult' && delta >= -5)             return;

      // Bystander effect: lower bias toward instigator
      this._bias.setRaw(`chat:${idA}`, -OBS_FACTOR * 2);
    });

    // 3. Social bonding witnessed (hug / kiss)
    this._on('social:interaction', ({ idA, idB, type, score }) => {
      if (idA === this._sim.id || idB === this._sim.id) return;
      if (!this._inRange(idA) && !this._inRange(idB))   return;
      if (type !== 'hug' && type !== 'kiss')             return;

      // Curiosity: mild positive bias toward both participants
      for (const otherId of [idA, idB]) {
        this._bias.setRaw(`chat:${otherId}`, OBS_FACTOR);
      }
    });

    // 4. Gossip propagation from life events
    this._on('life:event', ({ simId, type, valence }) => {
      if (simId === this._sim.id) return;
      if (!this._inRange(simId))  return;

      // Nearby Sims form an opinion bias toward the affected Sim
      const sentiment = (valence ?? 0) > 0 ? OBS_FACTOR : -OBS_FACTOR * 1.2;
      this._bias.setRaw(`chat:${simId}`, sentiment);
    });
  }

  _on(event, handler) {
    bus.on(event, handler);
    this._handlers.push({ event, handler });
  }

  _inRange(otherId) {
    const game   = GameContext.game;
    if (!game)   return false;
    const other  = game.sims.find(s => s.id === otherId);
    if (!other)  return false;
    const dx     = (other.gx ?? 0) - (this._sim.gx ?? 0);
    const dz     = (other.gz ?? 0) - (this._sim.gz ?? 0);
    return Math.abs(dx) + Math.abs(dz) <= VIEW_RADIUS;
  }

  destroy() {
    for (const { event, handler } of this._handlers) bus.off(event, handler);
    this._handlers = [];
  }
}
