import { bus }        from '../core/EventBus.js';
import { MOOD_TIERS } from '../entities/EmotionEngine.js';

/**
 * MoodRing — animated SVG ring drawn around the selected Sim's feet.
 *
 * Replaces the static Three.js ring opacity with a CSS-animated
 * SVG circle overlay positioned via the same screen-projection used
 * by EmotionBadge.
 *
 * Features:
 *  - Colour tracks mood tier (miserable→red, sad→blue, neutral→grey,
 *    happy→green, ecstatic→gold)
 *  - Stroke-dashoffset animates to show emotional intensity (0–100 %)
 *  - Pulses faster when a spike is active
 *  - Only visible for the currently selected Sim (others get a faint dot)
 */

const TIER_COLOR = {
  miserable : '#ef9a9a',
  sad       : '#90caf9',
  neutral   : '#bdbdbd',
  happy     : '#a5d6a7',
  ecstatic  : '#ffd54f',
};

const CIRCUMFERENCE = 2 * Math.PI * 22; // r=22px → ~138px

export class MoodRing {
  constructor(sims, camera, renderer) {
    this._sims        = sims;
    this._camera      = camera;
    this._renderer    = renderer;
    this._selectedId  = null;
    this._els         = new Map(); // simId → SVGElement
    this._container   = this._createContainer();
    this._buildAll();
    this._registerBus();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  setSelected(simId) { this._selectedId = simId; }

  update() {
    const W = this._renderer.domElement.clientWidth;
    const H = this._renderer.domElement.clientHeight;

    for (const sim of this._sims) {
      const svg = this._els.get(sim.id);
      if (!svg) continue;

      // Project feet position
      const pos = sim.mesh.position.clone();
      pos.y = 0.05;
      pos.project(this._camera);
      const sx = ( pos.x * 0.5 + 0.5) * W;
      const sy = (-pos.y * 0.5 + 0.5) * H;
      svg.style.left = `${sx - 28}px`;
      svg.style.top  = `${sy - 28}px`;

      const isSelected = sim.id === this._selectedId;
      const tier  = sim.brain?.emotions?.tier ?? sim.mood?.tier ?? 'neutral';
      const color = TIER_COLOR[tier] ?? '#bdbdbd';

      const circle  = svg.querySelector('.mood-ring-track');
      const fill    = svg.querySelector('.mood-ring-fill');

      // Intensity from dominant spike (0–1) or baseline tier idx / 4
      const dom       = sim.emotions?.dominant;
      const intensity = dom ? dom.intensity : (MOOD_TIERS.indexOf(tier) / 4);
      const dash      = CIRCUMFERENCE * (1 - intensity);

      circle.setAttribute('stroke', color + '33'); // faint track
      fill.setAttribute('stroke',   color);
      fill.style.strokeDashoffset = String(dash);

      // Pulse speed: fast when spike active
      const dur = dom ? '0.9s' : '2.5s';
      svg.style.setProperty('--ring-dur', dur);

      // Visibility
      if (isSelected) {
        svg.style.opacity = '1';
        fill.style.strokeWidth = '3';
      } else {
        svg.style.opacity = '0.28';
        fill.style.strokeWidth = '1.5';
      }
    }
  }

  addSim(sim) {
    if (!this._els.has(sim.id)) {
      this._sims.push(sim);
      this._buildRing(sim);
    }
  }

  removeSim(simId) {
    const el = this._els.get(simId);
    if (el) { el.remove(); this._els.delete(simId); }
    this._sims = this._sims.filter(s => s.id !== simId);
  }

  destroy() { this._container.remove(); }

  // ── Private ───────────────────────────────────────────────────────────────

  _createContainer() {
    let c = document.getElementById('mood-ring-layer');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'mood-ring-layer';
    Object.assign(c.style, {
      position      : 'fixed',
      inset         : '0',
      pointerEvents : 'none',
      zIndex        : '115',
      overflow      : 'hidden',
    });
    if (!document.getElementById('mood-ring-css')) {
      const style = document.createElement('style');
      style.id = 'mood-ring-css';
      style.textContent = `
        .mood-ring-svg {
          position: absolute;
          width: 56px; height: 56px;
          overflow: visible;
          transition: opacity 0.3s ease;
        }
        .mood-ring-fill {
          stroke-dasharray: ${CIRCUMFERENCE};
          stroke-linecap: round;
          fill: none;
          transform-origin: 28px 28px;
          transform: rotate(-90deg);
          transition: stroke 0.4s ease, stroke-dashoffset 0.5s ease, stroke-width 0.2s;
          animation: ring-pulse var(--ring-dur, 2.5s) ease-in-out infinite;
        }
        @keyframes ring-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
        .mood-ring-track { fill: none; }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(c);
    return c;
  }

  _buildAll() {
    for (const sim of this._sims) this._buildRing(sim);
  }

  _buildRing(sim) {
    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('mood-ring-svg');
    svg.setAttribute('viewBox', '0 0 56 56');
    svg.style.opacity = '0';
    svg.dataset.simId = sim.id;

    const track = document.createElementNS(NS, 'circle');
    track.classList.add('mood-ring-track');
    track.setAttribute('cx', '28'); track.setAttribute('cy', '28'); track.setAttribute('r', '22');
    track.setAttribute('stroke-width', '3');

    const fill  = document.createElementNS(NS, 'circle');
    fill.classList.add('mood-ring-fill');
    fill.setAttribute('cx', '28'); fill.setAttribute('cy', '28'); fill.setAttribute('r', '22');
    fill.setAttribute('stroke-width', '3');
    fill.style.strokeDashoffset = String(CIRCUMFERENCE);

    svg.appendChild(track);
    svg.appendChild(fill);
    this._container.appendChild(svg);
    this._els.set(sim.id, svg);
  }

  _registerBus() {
    bus.on('sim:selected', ({ sim }) => this.setSelected(sim?.id ?? null));
  }
}
