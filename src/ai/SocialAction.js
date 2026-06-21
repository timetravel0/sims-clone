/**
 * SocialAction — Sprint 4
 * An Action that moves Sim A next to Sim B, then executes a social interaction.
 *
 * Supported interactions:
 *   chat     — small +social for both, slight +charisma XP
 *   joke     — +fun for both if charisma >= 3, else −social for B
 *   hug      — +social +comfort for both, requires relationship >= 30
 *   argue    — −social for both, −relationship; higher neurotic → more likely
 *   compliment — +social +relationship for B; tiny +charisma XP for A
 *
 * On completion emits: social:interaction { simA, simB, type, outcome }
 */
import { WalkToAction }  from './Action.js';
import { skillSystem }   from '../systems/SkillSystem.js';
import { bus }           from '../core/EventBus.js';

const INTERACTION_DEFS = {
  chat: {
    duration: 8,
    execute(a, b, rel) {
      a.needs.delta('social',  8);
      b.needs.delta('social',  6);
      skillSystem.gain(a, 'charisma', 0.1);
      return { success: true, relDelta: 3 };
    },
  },
  joke: {
    duration: 6,
    execute(a, b, rel) {
      const charisma = skillSystem.getLevel(a, 'charisma');
      if (charisma >= 3) {
        a.needs.delta('fun', 10);
        b.needs.delta('fun', 12);
        skillSystem.gain(a, 'charisma', 0.15);
        return { success: true, relDelta: 5 };
      }
      // Failed joke
      b.needs.delta('social', -5);
      return { success: false, relDelta: -3 };
    },
  },
  hug: {
    duration: 5,
    execute(a, b, rel) {
      if (rel < 30) return { success: false, relDelta: 0 };
      a.needs.delta('social',  12);
      b.needs.delta('social',  12);
      a.needs.delta('comfort',  5);
      b.needs.delta('comfort',  5);
      return { success: true, relDelta: 8 };
    },
  },
  argue: {
    duration: 10,
    execute(a, b, rel) {
      a.needs.delta('social', -8);
      b.needs.delta('social', -8);
      a.needs.delta('fun',    -5);
      b.needs.delta('fun',    -5);
      return { success: true, relDelta: -12 };
    },
  },
  compliment: {
    duration: 4,
    execute(a, b, rel) {
      b.needs.delta('social', 10);
      skillSystem.gain(a, 'charisma', 0.1);
      return { success: true, relDelta: 6 };
    },
  },
};

export class SocialAction {
  /**
   * @param {object} simA       — the actor Sim
   * @param {object} simB       — the target Sim
   * @param {string} type       — one of the INTERACTION_DEFS keys
   * @param {object} world      — World reference for pathfinding
   * @param {object} relGraph   — RelationshipGraph reference
   */
  constructor(simA, simB, type, world, relGraph) {
    this.simA     = simA;
    this.simB     = simB;
    this.type     = type in INTERACTION_DEFS ? type : 'chat';
    this.world    = world;
    this.relGraph = relGraph;
    this._phase   = 'walk';   // 'walk' | 'interact' | 'done'
    this._walkAction = null;
    this._timer      = 0;
    this.done        = false;
  }

  enter() {
    // Walk to a tile adjacent to simB
    const tx = this.simB.gridX + 1;
    const tz = this.simB.gridZ;
    this._walkAction = new WalkToAction(this.simA, this.world, tx, tz);
    this._walkAction.enter();
    this._phase = 'walk';
  }

  update(dt) {
    if (this._phase === 'walk') {
      this._walkAction.update(dt);
      if (this._walkAction.done) {
        this._phase = 'interact';
        this._timer = 0;
      }
      return;
    }

    if (this._phase === 'interact') {
      const def = INTERACTION_DEFS[this.type];
      this._timer += dt;
      if (this._timer >= def.duration) {
        const rel = this.relGraph?.getScore(this.simA.id, this.simB.id) ?? 0;
        const outcome = def.execute(this.simA, this.simB, rel);
        // Update relationship graph
        if (this.relGraph && outcome.relDelta !== 0) {
          this.relGraph.adjustScore(this.simA.id, this.simB.id, outcome.relDelta);
        }
        bus.emit('social:interaction', {
          simA: this.simA,
          simB: this.simB,
          type: this.type,
          outcome,
        });
        this._phase = 'done';
        this.done   = true;
      }
    }
  }

  exit() {
    this._walkAction?.exit?.();
  }
}
