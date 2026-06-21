import { bus }        from '../core/EventBus.js';
import { EMOTION_DEF } from '../entities/SimEmotions.js';

/**
 * EmotionBadge — floating emoji + label above every Sim's head.
 *
 * One badge per Sim, positioned via CSS `transform: translate()` updated
 * every frame by projecting the Sim's 3D world position onto screen coords.
 *
 * Structure (per Sim):
 *   <div class="emotion-badge" id="ebadge-{simId}">
 *     <span class="emotion-icon">😄</span>
 *     <span class="emotion-label">Joy</span>
 *   </div>
 *
 * Visibility rules:
 *   - Badge is visible only when an emotion is active (dominant != null)
 *   - Fades out over 0.4s when emotion clears
 *   - Pulses briefly on new emotion trigger (CSS animation)
 *   - If EmotionEngine is available on brain, uses its tier for badge border colour
 *
 * Z-index: 120 (above NeedsPanel 100, below tooltips 200)
 */

const TIER_BORDER = {
  miserable : '#ef9a9a',
  sad       : '#90caf9',
  neutral   : '#e0e0e0',
  happy     : '#a5d6a7',
  ecstatic  : '#ffd54f',
};

export class EmotionBadge {
  /**
   * @param {object[]} sims    — array of Sim instances
   * @param {object}   camera  — Three.js camera
   * @param {object}   renderer— Three.js renderer
   */
  constructor(sims, camera, renderer) {
    this._sims     = sims;
    this._camera   = camera;
    this._renderer = renderer;
    this._els      = new Map(); // simId → { root, icon, label }
    this._container = this._createContainer();
    this._registerBusListeners();
    this._buildAll();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /** Call once per frame AFTER Three.js render to sync positions. */
  update() {
    const W = this._renderer.domElement.clientWidth;
    const H = this._renderer.domElement.clientHeight;

    for (const sim of this._sims) {
      const els = this._els.get(sim.id);
      if (!els) continue;

      // Project 3D head position → NDC → CSS pixels
      const headY   = 1.55;  // slightly above head sphere (y=1.1 + 0.18r + 0.27 gap)
      const pos     = sim.mesh.position.clone();
      pos.y         = headY;
      pos.project(this._camera);

      const sx = ( pos.x * 0.5 + 0.5) * W;
      const sy = (-pos.y * 0.5 + 0.5) * H;

      els.root.style.transform = `translate(calc(${sx}px - 50%), calc(${sy}px - 100%))`;

      // Visibility: driven by dominant emotion
      const dom  = sim.emotions?.dominant;
      const tier = sim.brain?.emotions?.tier ?? sim.mood?.tier ?? 'neutral';

      if (dom) {
        const def = EMOTION_DEF[dom.type] ?? { emoji: '❓', color: '#fff', label: dom.type };
        els.icon.textContent  = def.emoji;
        els.label.textContent = def.label;
        els.root.style.borderColor    = def.color;
        els.root.style.setProperty('--badge-glow', def.color);
        els.root.style.opacity        = String(Math.min(1, dom.intensity * 1.5));
        els.root.style.pointerEvents  = 'auto';
      } else {
        // No active emotion — show mood tier with reduced opacity
        const tierColor = TIER_BORDER[tier] ?? '#e0e0e0';
        const TIER_EMOJI = { miserable:'😞', sad:'😐', neutral:'😶', happy:'🙂', ecstatic:'😄' };
        els.icon.textContent  = TIER_EMOJI[tier] ?? '😶';
        els.label.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
        els.root.style.borderColor   = tierColor;
        els.root.style.setProperty('--badge-glow', tierColor);
        els.root.style.opacity       = '0.45';
        els.root.style.pointerEvents = 'none';
      }
    }
  }

  /** Add a badge for a newly spawned Sim. */
  addSim(sim) {
    // Note: this._sims is the shared game.sims array — the Sim is already in it.
    // Only build the visual; do NOT push (that would duplicate the roster).
    if (!this._els.has(sim.id)) this._buildBadge(sim);
  }

  /** Remove badge when a Sim is removed from the lot. */
  removeSim(simId) {
    const els = this._els.get(simId);
    if (els) { els.root.remove(); this._els.delete(simId); }
    this._sims = this._sims.filter(s => s.id !== simId);
  }

  destroy() {
    this._container.remove();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _createContainer() {
    let c = document.getElementById('emotion-badge-layer');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'emotion-badge-layer';
    Object.assign(c.style, {
      position        : 'fixed',
      inset           : '0',
      pointerEvents   : 'none',
      zIndex          : '120',
      overflow        : 'hidden',
    });
    // Inject stylesheet once
    if (!document.getElementById('emotion-badge-css')) {
      const style = document.createElement('style');
      style.id = 'emotion-badge-css';
      style.textContent = `
        .emotion-badge {
          position: absolute;
          top: 0; left: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          background: rgba(10,10,14,0.72);
          border: 1.5px solid #e0e0e0;
          border-radius: 10px;
          padding: 3px 7px 2px;
          min-width: 44px;
          transition: opacity 0.35s ease, border-color 0.2s ease, box-shadow 0.2s ease;
          backdrop-filter: blur(4px);
          box-shadow: 0 0 8px 1px var(--badge-glow, #fff4), 0 2px 8px #0005;
          cursor: default;
          user-select: none;
          will-change: transform, opacity;
        }
        .emotion-badge .e-icon {
          font-size: 18px;
          line-height: 1;
          filter: drop-shadow(0 1px 2px #0008);
        }
        .emotion-badge .e-label {
          font-family: system-ui, sans-serif;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #ffffffcc;
          text-transform: uppercase;
          line-height: 1;
        }
        @keyframes badge-pop {
          0%   { transform: translate(var(--bx), var(--by)) scale(1); }
          40%  { transform: translate(var(--bx), var(--by)) scale(1.35); }
          70%  { transform: translate(var(--bx), var(--by)) scale(0.92); }
          100% { transform: translate(var(--bx), var(--by)) scale(1); }
        }
        .emotion-badge.pop {
          animation: badge-pop 0.38s cubic-bezier(0.34,1.56,0.64,1) both;
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(c);
    return c;
  }

  _buildAll() {
    for (const sim of this._sims) this._buildBadge(sim);
  }

  _buildBadge(sim) {
    const root  = document.createElement('div');
    root.className = 'emotion-badge';
    root.id        = `ebadge-${sim.id}`;
    root.dataset.simId = sim.id;
    root.style.opacity = '0';

    const icon  = document.createElement('span');
    icon.className = 'e-icon';
    icon.textContent = '😶';

    const label = document.createElement('span');
    label.className = 'e-label';
    label.textContent = 'Neutral';

    root.appendChild(icon);
    root.appendChild(label);
    this._container.appendChild(root);
    this._els.set(sim.id, { root, icon, label });
  }

  _registerBusListeners() {
    // Trigger pop animation on new emotion spike
    bus.on('emotion:triggered', ({ simId }) => {
      const els = this._els.get(simId);
      if (!els) return;
      els.root.classList.remove('pop');
      void els.root.offsetWidth; // reflow trick to restart animation
      els.root.classList.add('pop');
    });
    bus.on('emotion:spike', ({ simId }) => {
      const els = this._els.get(simId);
      if (!els) return;
      els.root.classList.remove('pop');
      void els.root.offsetWidth;
      els.root.classList.add('pop');
    });
  }
}
