import { memorySystem }  from './MemorySystem.js';
import { bus }           from '../core/EventBus.js';

/**
 * NarrativePlanner — generates narrative story entries from significant events.
 *
 * Listens to the event bus and converts raw game events into
 * human-readable story lines, enriched with emotional context.
 *
 * Also detects emergent story beats:
 *   - Rival pair  (two Sims with repeated negative interactions)
 *   - Best friends (score > 70 + shared positive memories)
 *   - Loner       (Sim with social < 20 for an extended time)
 *   - Comeback     (Sim recovers from miserable to happy)
 */
export class NarrativePlanner {
  constructor(sims) {
    this._sims      = sims;
    this._stateMap  = new Map(); // simId → { loneTimer, wasMiserable }
    this._pairs     = new Set(); // 'id1:id2' strings already announced as rivals/bff
    this._registerListeners();
  }

  _state(simId) {
    if (!this._stateMap.has(simId)) this._stateMap.set(simId, { loneTimer: 0, wasMiserable: false });
    return this._stateMap.get(simId);
  }

  _registerListeners() {
    // Social beats
    bus.on('social:interaction', ({ nameA, nameB, type, score, delta, idA, idB }) => {
      if (type === 'hug' && score > 60) {
        this._announceIfNew(`${idA}:${idB}`, `${nameA} and ${nameB} are now Best Friends 💚`, 'positive');
      } else if (type === 'insult' && score < -30) {
        this._announceIfNew(`${idA}:${idB}`, `${nameA} and ${nameB} have become bitter rivals 😡`, 'drama');
      } else if (delta > 0) {
        bus.emit('story:entry', { text: `${nameA} had a good ${type} with ${nameB}`, cat: 'positive' });
      } else {
        bus.emit('story:entry', { text: `${nameA} and ${nameB} argued (${type})`, cat: 'drama' });
      }
    });

    // Emotion beats
    bus.on('emotion:triggered', ({ simName, type, intensity }) => {
      if (intensity < 0.6) return; // only strong emotions reach the log
      const phrases = {
        jealousy:   `${simName} feels a sting of jealousy`,
        grief:      `${simName} is overcome with sadness`,
        pride:      `${simName} feels a surge of pride`,
        excitement: `${simName} can barely contain their excitement`,
        anger:      `${simName} is furious`,
        loneliness: `${simName} feels utterly alone`,
        joy:        `${simName} bursts with joy`,
        hope:       `${simName} feels a spark of hope`,
      };
      if (phrases[type]) bus.emit('story:entry', { text: phrases[type], cat: this._catForEmotion(type) });
    });

    // Mood tier change
    bus.on('sim:moodChanged', ({ name, from, to }) => {
      if (to === 'ecstatic') bus.emit('story:entry', { text: `${name} is absolutely ecstatic! 🌟`, cat: 'positive' });
      if (to === 'miserable') bus.emit('story:entry', { text: `${name} hits rock bottom 😫`, cat: 'drama' });
      if (from === 'miserable' && (to === 'happy' || to === 'neutral')) {
        bus.emit('story:entry', { text: `${name} makes a comeback 💪`, cat: 'positive' });
      }
    });

    // Memory recorded (only very intense ones)
    bus.on('memory:recorded', ({ memory }) => {
      if (memory.intensity < 0.75) return;
      if (memory.type === 'need_crisis') {
        const sim = this._sims.find(s => s.id === memory.simId);
        if (sim) bus.emit('story:entry', {
          text: `${sim.name} is in desperate need of ${memory.data.need}`,
          cat: 'need'
        });
      }
    });

    bus.on('life:event', ({ simName, type, valence }) => {
      const labels = {
        promoted: 'promotion',
        fired: 'firing',
        heartbreak: 'heartbreak',
        windfall: 'windfall',
      };
      if (!labels[type]) return;
      bus.emit('story:entry', {
        text: `${simName}'s ${labels[type]} ripples through the household`,
        cat: valence >= 0 ? 'positive' : 'gossip',
      });
    });
  }

  _announceIfNew(pairKey, text, cat) {
    if (this._pairs.has(pairKey)) return;
    this._pairs.add(pairKey);
    bus.emit('story:entry', { text, cat });
  }

  _catForEmotion(type) {
    return { jealousy:'gossip', grief:'mood', pride:'positive',
             excitement:'positive', anger:'drama', loneliness:'mood',
             joy:'positive', hope:'positive' }[type] || 'neutral';
  }

  /** Tick-based beats (loner detection, etc.) */
  update(dt) {
    for (const sim of this._sims) {
      const st = this._state(sim.id);
      // Loner detection
      const social = sim.needs.get('social');
      if (social < 20) {
        st.loneTimer += dt;
        if (st.loneTimer > 60) { // isolated for 60+ sim-seconds
          bus.emit('story:entry', { text: `${sim.name} has been alone for too long…`, cat: 'mood' });
          st.loneTimer = 0;
        }
      } else {
        st.loneTimer = 0;
      }
    }
  }
}
