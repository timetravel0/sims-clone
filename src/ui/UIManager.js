import { NeedsPanel }        from './NeedsPanel.js';
import { SimSelector }       from './SimSelector.js';
import { ClockDisplay }      from './ClockDisplay.js';
import { BuildPanel }        from './BuildPanel.js';
import { RelationshipPanel } from './RelationshipPanel.js';
import { SimStatusLog }      from './SimStatusLog.js';
import { EmotionBadge }      from './EmotionBadge.js';
import { MoodRing }          from './MoodRing.js';
import { EmotionTooltip }    from './EmotionTooltip.js';
import { MemoryLog }         from './MemoryLog.js';
import { bus }               from '../core/EventBus.js';

export class UIManager {
  constructor(sims, selectedSim, _bus, camera, renderer) {
    this._sims      = sims;
    this._panel     = new NeedsPanel(selectedSim.name);
    this._selector  = new SimSelector(sims);
    this._clock     = new ClockDisplay();
    this._build     = new BuildPanel();
    this._rel       = new RelationshipPanel();
    this._statusLog = new SimStatusLog();

    // ── Emotional UI ──────────────────────────────────────────────────────
    this._emotionBadge   = new EmotionBadge(sims, camera, renderer);
    this._moodRing       = new MoodRing(sims, camera, renderer);
    this._emotionTooltip = new EmotionTooltip(sims);
    this._memoryLog      = new MemoryLog();

    // Bind tooltip hover listeners after one frame (badges are in DOM)
    requestAnimationFrame(() => this._emotionTooltip.bindBadges());

    // ── Bus listeners ─────────────────────────────────────────────────────
    bus.on('sim:selected', ({ sim }) => {
      this._panel.setSimName(sim.name);
      this._panel.setTraits(sim.personality?.describe?.() || '');
      this._moodRing.setSelected(sim.id);
    });

    bus.on('simNeeds:update', ({ simId, values }) => {
      if (window._game?.selectedSim?.id === simId) this._panel.update(values);
    });

    bus.on('daynight:update', ({ hour }) => this._clock.update(hour));

    // When a new Sim is spawned at runtime, register it with emotional UI
    bus.on('sim:spawned', ({ sim }) => {
      this._emotionBadge.addSim(sim);
      this._moodRing.addSim(sim);
      this._emotionTooltip.addSim?.(sim);
    });
    // When a Sim leaves the lot, drop its visuals
    bus.on('sim:despawned', ({ simId }) => {
      this._emotionBadge.removeSim?.(simId);
      this._moodRing.removeSim?.(simId);
      this._emotionTooltip.removeSim?.(simId);
    });
  }

  /**
   * Call once per frame from Game.js render loop,
   * AFTER renderer.render() so screen-space projections are correct.
   */
  updateOverlays() {
    this._emotionBadge.update();
    this._moodRing.update();
    this._selector.update?.();
  }

  destroy() {
    this._emotionBadge.destroy();
    this._moodRing.destroy();
    this._emotionTooltip.destroy();
    this._memoryLog.destroy();
  }
}
