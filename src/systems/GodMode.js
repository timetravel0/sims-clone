import { WalkToAction, UseObjectAction } from '../ai/Action.js';
import { SocialAction } from '../ai/SocialAction.js';
import { memorySystem } from './MemorySystem.js';
import { lifeEventBus } from '../core/LifeEventBus.js';
import { bus } from '../core/EventBus.js';

const TRAITS = ['outgoing', 'neurotic', 'playful', 'nice', 'ambitious'];
const LIFE_EVENT_DEF = {
  promoted:   { valence: 0.9, emotion: 'pride',      text: sim => `${sim.name} was promoted` },
  fired:      { valence: -0.9, emotion: 'grief',      text: sim => `${sim.name} was fired` },
  heartbreak: { valence: -0.8, emotion: 'jealousy',   text: sim => `${sim.name} suffered heartbreak` },
  windfall:   { valence: 0.8, emotion: 'excitement', text: sim => `${sim.name} received a windfall` },
};

export class GodMode {
  constructor(game) {
    this._game = game;
  }

  whisper(sim, intent) {
    if (!sim) return false;
    const actions = this._actionsForIntent(sim, intent);
    if (actions.length === 0) return false;
    const accepted = this._acceptsWhisper(sim, intent);
    memorySystem.record(sim.id, 'god_action', { mode: 'whisper', intent, accepted }, 0.45, accepted ? 0.25 : -0.15);
    bus.emit('god:action', { mode: 'whisper', simId: sim.id, simName: sim.name, intent, accepted });
    if (!accepted) {
      sim.showBubble('No', 1.2);
      bus.emit('story:entry', { text: `${sim.name} ignored a whisper`, cat: 'mood' });
      return false;
    }
    sim.brain.override(actions);
    sim.showBubble('Whisper', 1.4);
    bus.emit('story:entry', { text: `${sim.name} followed a whisper`, cat: 'positive' });
    return true;
  }

  impose(sim, intent) {
    if (!sim) return false;
    const actions = this._actionsForIntent(sim, intent);
    if (actions.length === 0) return false;
    sim.brain.override(actions);
    sim.needs.decay('fun', 10);
    sim.needs.decay('comfort', 8);
    sim.emotions.trigger('anger', 0.55 + Math.max(0, sim.personality.neurotic) * 0.25);
    memorySystem.record(sim.id, 'god_action', { mode: 'impose', intent }, 0.75, -0.55);
    bus.emit('god:action', { mode: 'impose', simId: sim.id, simName: sim.name, intent, accepted: true });
    bus.emit('story:entry', { text: `${sim.name} was forced to ${intent}`, cat: 'drama' });
    return true;
  }

  bless(sim, trait) {
    return this._shiftTrait(sim, trait, 0.25, 'bless');
  }

  curse(sim, trait) {
    return this._shiftTrait(sim, trait, -0.25, 'curse');
  }

  lifeEvent(sim, type) {
    if (!sim || !LIFE_EVENT_DEF[type]) return false;
    const def = LIFE_EVENT_DEF[type];
    const valence = def.valence;
    memorySystem.record(sim.id, 'life_event', { type }, 0.95, valence, 0.0008);
    sim.emotions.trigger(def.emotion, 0.85);
    this._applyLifeEventNeeds(sim, type);
    const event = lifeEventBus.emit(type, { simId: sim.id, simName: sim.name, valence });
    bus.emit('story:entry', { text: def.text(sim), cat: valence >= 0 ? 'positive' : 'drama' });
    bus.emit('god:action', { mode: 'lifeEvent', simId: sim.id, simName: sim.name, intent: type, accepted: true });
    return event;
  }

  _acceptsWhisper(sim, intent) {
    const p = sim.personality;
    let chance = 0.62;
    if (intent === 'socialize') chance += p.outgoing * 0.22 + p.nice * 0.12;
    if (intent === 'have_fun') chance += p.playful * 0.22;
    if (intent === 'rest') chance -= p.ambitious * 0.18;
    if (intent === 'argue') chance -= p.nice * 0.28;
    chance -= Math.max(0, p.neurotic) * 0.12;
    return Math.random() < Math.max(0.12, Math.min(0.92, chance));
  }

  _actionsForIntent(sim, intent) {
    if (intent === 'socialize' || intent === 'argue') {
      const target = this._nearestOther(sim);
      if (!target) return [];
      return [new SocialAction(sim, target, this._game.world, intent === 'argue' ? 'argue' : 'chat')];
    }
    const need = {
      eat: 'hunger',
      rest: 'energy',
      clean: 'hygiene',
      have_fun: 'fun',
      comfort: 'comfort',
    }[intent];
    if (!need) return [];
    const furniture = this._game.world.furniture.find(f =>
      f.needTarget === need && !f.inUse && (!f.reservedBy || f.reservedBy === sim.id)
    );
    if (!furniture || !this._game.world.reserveFurniture(furniture, sim)) return [];
    const targetGz = furniture.gz + 1 < this._game.world.tilemap.height ? furniture.gz + 1 : furniture.gz - 1;
    return [
      new WalkToAction(sim, this._game.world, furniture.gx, targetGz),
      new UseObjectAction(sim, furniture, 5),
    ];
  }

  _nearestOther(sim) {
    const others = this._game.sims.filter(s => s.id !== sim.id);
    others.sort((a, b) => {
      const da = Math.abs(a.gx - sim.gx) + Math.abs(a.gz - sim.gz);
      const db = Math.abs(b.gx - sim.gx) + Math.abs(b.gz - sim.gz);
      return da - db;
    });
    return others[0] || null;
  }

  _shiftTrait(sim, trait, delta, mode) {
    if (!sim || !TRAITS.includes(trait)) return false;
    const prev = sim.personality[trait];
    sim.personality[trait] = Math.max(-1, Math.min(1, prev + delta));
    const positive = mode === 'bless';
    memorySystem.record(sim.id, 'god_action', { mode, trait, from: prev, to: sim.personality[trait] }, 0.8, positive ? 0.55 : -0.55);
    sim.emotions.trigger(positive ? 'hope' : 'grief', 0.65);
    bus.emit('god:action', { mode, simId: sim.id, simName: sim.name, intent: trait, accepted: true });
    bus.emit('story:entry', { text: `${sim.name} was ${mode === 'bless' ? 'blessed' : 'cursed'}: ${trait}`, cat: positive ? 'positive' : 'drama' });
    bus.emit('sim:selected', { sim });
    return true;
  }

  _applyLifeEventNeeds(sim, type) {
    if (type === 'promoted') { sim.needs.restore('fun', 12); sim.needs.decay('energy', 10); }
    if (type === 'fired') { sim.needs.decay('comfort', 18); sim.needs.decay('fun', 14); }
    if (type === 'heartbreak') { sim.needs.decay('social', 22); sim.needs.decay('fun', 12); }
    if (type === 'windfall') { sim.needs.restore('comfort', 20); sim.needs.restore('fun', 14); }
  }
}
