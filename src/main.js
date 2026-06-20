import { Game } from './core/Game.js';
import { bus }  from './core/EventBus.js';

const game = new Game(document.getElementById('canvas-container'));
game.start();

// ── Speed / Pause ────────────────────────────────────────────────
const btnPause = document.getElementById('btn-pause');
const btn1x = document.getElementById('btn-1x');
const btn2x = document.getElementById('btn-2x');
const btn5x = document.getElementById('btn-5x');
const speedLbl = document.getElementById('speed-label');

function setSpeed(s, btn) {
  game.setSpeed(s);
  [btn1x, btn2x, btn5x].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  speedLbl.textContent = `Speed: ${s}×`;
}
btn1x.addEventListener('click', () => setSpeed(1, btn1x));
btn2x.addEventListener('click', () => setSpeed(2, btn2x));
btn5x.addEventListener('click', () => setSpeed(5, btn5x));
btnPause.addEventListener('click', () => {
  const p = game.togglePause();
  btnPause.textContent = p ? '▶ Resume' : '⏸ Pause';
  btnPause.classList.toggle('active', p);
});

// ── Story panel ──────────────────────────────────────────────────
const storyPanel = document.getElementById('story-panel');
document.getElementById('btn-story')?.addEventListener('click', () => {
  const v = storyPanel.style.display === 'block';
  storyPanel.style.display = v ? 'none' : 'block';
  document.getElementById('btn-story').classList.toggle('active', !v);
});

// ── Relations panel ──────────────────────────────────────────────
const relPanel = document.getElementById('rel-panel');
document.getElementById('btn-rel')?.addEventListener('click', () => {
  const v = relPanel.style.display === 'block';
  relPanel.style.display = v ? 'none' : 'block';
  document.getElementById('btn-rel').classList.toggle('active', !v);
});

// ── Save / Load ──────────────────────────────────────────────────
document.getElementById('btn-save')?.addEventListener('click', () => game._saveLoad.save(1));
document.getElementById('btn-load')?.addEventListener('click', () => game._saveLoad.load(1));

// ── Portrait bar ─────────────────────────────────────────────────
const sel = document.getElementById('sim-selector');
const simColors = ['#4fc3f7','#f48fb1','#a5d6a7'];
game.sims.forEach((sim, i) => {
  const btn = document.createElement('button');
  btn.className = 'sim-portrait';
  btn.style.cssText = `border-color:${simColors[i]};background:${simColors[i]}22`;
  btn.innerHTML = `<span>${sim.name.slice(0,2)}</span><span class="sim-mood-dot" id="mood-${sim.id}">😐</span>`;
  btn.addEventListener('click', () => game.selectSimByIndex(i));
  sel.appendChild(btn);
});

// Update portrait mood dots
bus.on('sim:moodChanged', ({ simId, tier }) => {
  const el = document.getElementById(`mood-${simId}`);
  const EMOJI = { ecstatic:'🌟', happy:'😊', neutral:'😐', sad:'😢', miserable:'😫' };
  if (el) el.textContent = EMOJI[tier] || '😐';
});

// ── Needs panel: traits + mood ────────────────────────────────────
bus.on('sim:selected', ({ sim }) => {
  const traitsEl = document.getElementById('sim-traits');
  if (traitsEl) traitsEl.textContent = sim.personality.describe();
});
bus.on('sim:moodChanged', ({ simId, to, tier }) => {
  if (window._game?.selectedSim?.id === simId) {
    const el = document.getElementById('sim-mood');
    if (el) el.textContent = `${tier.emoji} ${tier.label}`;
  }
});

// ── Speech bubbles (DOM overlay, projected from 3D) ──────────────
const bubblesEl = document.getElementById('bubbles');
game.sims.forEach(sim => {
  const div = document.createElement('div');
  div.id = `bubble-${sim.id}`;
  div.className = 'bubble';
  bubblesEl.appendChild(div);
});

import * as THREE from 'three';
function projectToScreen(worldPos) {
  const cam = game._camera?.camera;
  if (!cam) return null;
  const v = worldPos.clone().project(cam);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight - 60,
  };
}

function updateBubbles() {
  game.sims.forEach(sim => {
    const el  = document.getElementById(`bubble-${sim.id}`);
    if (!el) return;
    const pos = projectToScreen(
      new THREE.Vector3(sim.worldX, 1.5, sim.worldZ)
    );
    if (pos) { el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; }
  });
  requestAnimationFrame(updateBubbles);
}
updateBubbles();

// ── Drama toasts ─────────────────────────────────────────────────
const toastEl = document.getElementById('drama-toast');
function showToast(text, cat = 'drama') {
  const d = document.createElement('div');
  d.className = `toast ${cat}`;
  d.textContent = text;
  toastEl.prepend(d);
  setTimeout(() => d.remove(), 3400);
}

bus.on('drama:event', ({ type, names }) => {
  const LABELS = {
    betrayal: `💔 Betrayal! ${names[0]} betrayed ${names[1]}`,
    jealousy: `😒 ${names[0]} is jealous of ${names[1]}`,
    reconciliation: `🤝 ${names[0]} & ${names[1]} made up`,
    crush:    `💘 ${names[0]} has a crush on ${names[1]}!`,
    rivalry:  `⚔️ ${names[0]} and ${names[1]} are now rivals!`,
    forgiveness: `🕊️ ${names[0]} forgave ${names[1]}`,
  };
  if (LABELS[type]) showToast(LABELS[type], type === 'crush' || type === 'reconciliation' ? 'positive' : 'drama');
});
bus.on('relationship:milestone', ({ nameA, nameB, level }) => {
  const LABELS = {
    friend: `🤝 ${nameA} & ${nameB} are now friends!`,
    good_friend: `😊 ${nameA} & ${nameB} are good friends`,
    best_friend: `💛 ${nameA} & ${nameB} are BFFs!`,
    enemy: `😠 ${nameA} & ${nameB} are enemies now`,
  };
  if (LABELS[level]) showToast(LABELS[level], level === 'enemy' ? 'drama' : 'positive');
});
