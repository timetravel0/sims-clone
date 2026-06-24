/**
 * EmoteRenderer — Sprint 4
 * Renders floating emoji bubbles above Sims' heads in 3D space.
 * Uses THREE.Sprite with a canvas-texture.
 *
 * Triggered by:
 *   mood:changed       → shows mood emoji for 3s
 *   social:interaction → shows interaction emoji for 2.5s
 *   skill:levelUp      → shows ⬆ + skill emoji for 2s
 *   weather:changed    → shows weather emoji for 2s (on all sims)
 *
 * Each Sim can have at most 1 active emote at a time (new overwrites old).
 */
import * as THREE from 'three';
import { bus }   from '../core/EventBus.js';

const MOOD_EMOJI = {
  ecstatic:  '😄',
  happy:     '🙂',
  neutral:   '😐',
  sad:       '😢',
  miserable: '😭',
};

const INTERACTION_EMOJI = {
  chat:       '💬',
  joke:       '😂',
  hug:        '🤗',
  argue:      '😠',
  compliment: '✨',
};

const WEATHER_EMOJI = {
  sunny:  '☀️',
  cloudy: '⛅',
  rainy:  '🌧️',
  stormy: '⛈️',
  foggy:  '🌫️',
};

const SKILL_EMOJI = {
  cooking:    '🍳',
  logic:      '🧩',
  charisma:   '💬',
  fitness:    '💪',
  creativity: '🎨',
  handiness:  '🔧',
};

function makeSprite(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width  = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.6, 1);
  return sprite;
}

export class EmoteRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {Sim[]} sims
   */
  constructor(scene, sims) {
    this._scene   = scene;
    this._sims    = sims;
    /** @type {Map<string, {sprite: THREE.Sprite, ttl: number}>} */
    this._active  = new Map();

    const isHH = sim => sim && !sim._isVisitor;
    bus.on('mood:changed',        ({ sim, next })        => { if (isHH(sim)) this._show(sim, MOOD_EMOJI[next] ?? '😐', 3.0); });
    bus.on('social:interaction',  ({ simA, type })       => { if (isHH(simA)) this._show(simA, INTERACTION_EMOJI[type] ?? '💬', 2.5); });
    bus.on('skill:levelUp',       ({ sim, skill })       => { if (isHH(sim)) this._show(sim, (SKILL_EMOJI[skill] ?? '⬆') + '⬆', 2.0); });
    bus.on('weather:changed',     ({ next })             => {
      for (const s of this._sims) if (isHH(s)) this._show(s, WEATHER_EMOJI[next] ?? '🌤', 2.0);
    });
  }

  _show(sim, emoji, ttl) {
    // Remove previous
    const prev = this._active.get(sim.id);
    if (prev) {
      this._scene.remove(prev.sprite);
      prev.sprite.material.map.dispose();
      prev.sprite.material.dispose();
    }
    const sprite = makeSprite(emoji);
    // Position above sim head
    const pos = sim.mesh?.position ?? new THREE.Vector3();
    sprite.position.set(pos.x, pos.y + 1.4, pos.z);
    this._scene.add(sprite);
    this._active.set(sim.id, { sprite, ttl, simId: sim.id, sim });
  }

  update(dt) {
    for (const [id, entry] of this._active) {
      // Track sim position
      const pos = entry.sim.mesh?.position;
      if (pos) entry.sprite.position.set(pos.x, pos.y + 1.4, pos.z);
      // Float upward gently
      entry.sprite.position.y += dt * 0.08;
      entry.ttl -= dt;
      if (entry.ttl <= 0) {
        this._scene.remove(entry.sprite);
        entry.sprite.material.map.dispose();
        entry.sprite.material.dispose();
        this._active.delete(id);
      }
    }
  }
}
