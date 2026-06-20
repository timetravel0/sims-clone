import * as THREE from 'three';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

import { Game } from './core/Game.js';

const container = document.getElementById('canvas-container');
const game = new Game(container);
game.start();

// ── Toolbar wiring ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

$('btn-pause')?.addEventListener('click', () => {
  const paused = game.togglePause();
  $('btn-pause').textContent = paused ? '▶ Resume' : '⏸ Pause';
});

['1x','2x','5x'].forEach(s => {
  $(`btn-${s}`)?.addEventListener('click', () => {
    game.setSpeed(parseFloat(s));
    ['1x','2x','5x'].forEach(b => $(`btn-${b}`)?.classList.remove('active'));
    $(`btn-${s}`)?.classList.add('active');
    $('speed-label').textContent = `Speed: ${s}`;
  });
});

$('btn-story')?.addEventListener('click', () => {
  const p = $('story-panel');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
});

$('btn-rel')?.addEventListener('click', () => {
  const p = $('rel-panel');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
});

$('btn-build')?.addEventListener('click', () => {
  game.buildMode.setActive(!game.buildMode.active);
});

$('btn-save')?.addEventListener('click', () => game._saveLoad?.save());
$('btn-load')?.addEventListener('click', () => game._saveLoad?.load());

// Clock display
setInterval(() => {
  const t = game.dayNight?.time ?? 9;
  const h = Math.floor(t) % 24;
  const m = Math.floor((t % 1) * 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh   = h % 12 || 12;
  const mm   = String(m).padStart(2, '0');
  const el   = $('clock');
  if (el) el.textContent = `${hh}:${mm} ${ampm}`;
}, 500);
