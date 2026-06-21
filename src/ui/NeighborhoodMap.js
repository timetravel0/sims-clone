/**
 * NeighborhoodMap — Sprint 5
 * Mini-map rendered on a 2D <canvas> overlay.
 *
 * Draws:
 *  - Tile grid (walkable = light, blocked = dark)
 *  - Furniture footprints (colored dots)
 *  - Wall/door edges (lines)
 *  - Sim positions (colored circles with initials)
 *  - Weather icon in top-right corner
 *  - Selected Sim indicator (pulsing ring)
 *
 * Updates every 500 ms to avoid overdraw.
 * DOM anchor: <canvas id="minimap">
 */
import { weatherSystem } from '../systems/WeatherSystem.js';

const WEATHER_ICONS = {
  sunny: '☀', cloudy: '⛅', rainy: '🌧', stormy: '⛈', foggy: '🌫',
};

const MAP_SIZE  = 160;  // canvas px
const TILE_SIZE = MAP_SIZE / 16; // 16-tile grid → 10px per tile

export class NeighborhoodMap {
  /**
   * @param {object} game        — Game instance
   * @param {WallManager} wm     — WallManager
   */
  constructor(game, wm) {
    this._game = game;
    this._wm   = wm;
    this._canvas = document.getElementById('minimap');
    if (!this._canvas) return;
    this._canvas.width  = MAP_SIZE;
    this._canvas.height = MAP_SIZE;
    this._ctx = this._canvas.getContext('2d');
    this._interval = setInterval(() => this._draw(), 500);
    this._draw();
  }

  destroy() { clearInterval(this._interval); }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const { world, sims, selectedSim } = this._game;
    const tileMap = world?.tileMap;

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Background
    ctx.fillStyle = '#1a1814';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Tile grid
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const walkable = tileMap?.isWalkable(x, z) ?? true;
        ctx.fillStyle = walkable ? '#2e2c28' : '#111';
        ctx.fillRect(x * TILE_SIZE + 0.5, z * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }

    // Furniture footprints
    if (world?.furniture) {
      for (const f of world.furniture) {
        ctx.fillStyle = `#${(f.color ?? 0x888888).toString(16).padStart(6, '0')}`;
        ctx.fillRect(
          f.gx * TILE_SIZE + 1, f.gz * TILE_SIZE + 1,
          TILE_SIZE - 2, TILE_SIZE - 2
        );
      }
    }

    // Walls / doors
    if (this._wm?._edges) {
      for (const [key, { type }] of this._wm._edges) {
        const [a, b] = key.split(':').map(p => p.split(',').map(Number));
        ctx.strokeStyle = type === 'door' ? '#c8a850' : '#d4c9b0';
        ctx.lineWidth   = type === 'door' ? 1.5 : 2;
        ctx.beginPath();
        ctx.moveTo(a[0] * TILE_SIZE + TILE_SIZE / 2, a[1] * TILE_SIZE + TILE_SIZE / 2);
        ctx.lineTo(b[0] * TILE_SIZE + TILE_SIZE / 2, b[1] * TILE_SIZE + TILE_SIZE / 2);
        ctx.stroke();
      }
    }

    // Sims
    for (const sim of (sims ?? [])) {
      const sx = (sim.gridX ?? 8) * TILE_SIZE + TILE_SIZE / 2;
      const sz = (sim.gridZ ?? 8) * TILE_SIZE + TILE_SIZE / 2;
      const r  = TILE_SIZE * 0.38;

      // Pulse ring for selected
      if (sim === selectedSim) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sz, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sim dot
      ctx.fillStyle = `#${(sim.color ?? 0x4fc3f7).toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(sx, sz, r, 0, Math.PI * 2);
      ctx.fill();

      // Initial
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${TILE_SIZE * 0.5}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sim.name?.[0] ?? '?', sx, sz);
    }

    // Weather icon
    const wx = MAP_SIZE - 14;
    const wz = 14;
    ctx.font = '14px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(WEATHER_ICONS[weatherSystem.current] ?? '☀', wx, wz);

    // Border
    ctx.strokeStyle = '#393836';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
  }
}
