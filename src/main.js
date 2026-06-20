import { Game } from './core/Game.js';

const container = document.getElementById('canvas-container');
const game = new Game(container);
game.start();

// --- Toolbar wiring ---
const btnPause = document.getElementById('btn-pause');
const btn1x    = document.getElementById('btn-1x');
const btn2x    = document.getElementById('btn-2x');
const btn5x    = document.getElementById('btn-5x');
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
  const paused = game.togglePause();
  btnPause.textContent = paused ? '▶ Resume' : '⏸ Pause';
  btnPause.classList.toggle('active', paused);
});

// --- Save / Load ---
document.getElementById('btn-save')?.addEventListener('click', async () => {
  await game._saveLoad.save(1);
});
document.getElementById('btn-load')?.addEventListener('click', async () => {
  await game._saveLoad.load(1);
});
