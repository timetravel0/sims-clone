/**
 * RoomOverlay — Sprint 6
 * Renders detected rooms as coloured floor tints on a 2D canvas overlay.
 * Only visible when toggled (default hidden).
 *
 * Colour coding:
 *   closet      → red tint     (claustrophobic, mood -5)
 *   small room  → yellow tint  (mood +2)
 *   room        → green tint   (mood +5)
 *   large room  → cyan tint    (mood +8)
 *
 * Also draws centroid label with room type + mood bonus.
 * Updates on rooms:updated event.
 *
 * DOM anchor: <canvas id="room-overlay">
 */
import { bus } from '../core/EventBus.js';

const MAP_SIZE  = 160;
const TILE_SIZE = MAP_SIZE / 16;

const ROOM_COLORS = {
  'closet':      'rgba(229, 57, 53, 0.25)',
  'small room':  'rgba(251,192,45, 0.22)',
  'room':        'rgba(76,175,80,  0.22)',
  'large room':  'rgba(0, 188,212, 0.20)',
};

export class RoomOverlay {
  /**
   * @param {RoomDetector} roomDetector
   */
  constructor(roomDetector) {
    this._rd      = roomDetector;
    this._canvas  = document.getElementById('room-overlay');
    this._visible = false;
    if (!this._canvas) return;
    this._canvas.width  = MAP_SIZE;
    this._canvas.height = MAP_SIZE;
    this._ctx = this._canvas.getContext('2d');
    this._canvas.style.display = 'none';

    bus.on('rooms:updated', () => { if (this._visible) this._draw(); });
  }

  show() {
    this._visible = true;
    if (this._canvas) this._canvas.style.display = 'block';
    this._draw();
  }
  hide() {
    this._visible = false;
    if (this._canvas) this._canvas.style.display = 'none';
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    for (const room of (this._rd?.rooms ?? [])) {
      const fillColor = ROOM_COLORS[room.type] ?? 'rgba(255,255,255,0.1)';

      // Fill tiles
      ctx.fillStyle = fillColor;
      for (const key of room.tiles) {
        const [x, z] = key.split(',').map(Number);
        ctx.fillRect(x * TILE_SIZE, z * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }

      // Centroid label
      const cx = room.centroid.x * TILE_SIZE + TILE_SIZE / 2;
      const cz = room.centroid.z * TILE_SIZE + TILE_SIZE / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${TILE_SIZE * 0.55}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const bonus = room.moodBonus >= 0 ? `+${room.moodBonus}` : `${room.moodBonus}`;
      ctx.fillText(bonus, cx, cz);
    }
  }
}
