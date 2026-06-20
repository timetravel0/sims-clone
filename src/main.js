import { Game } from './core/Game.js';

const game = new Game(document.getElementById('canvas-container'));
game.start();

// Speed / pause
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

// Relations panel toggle
const relPanel = document.getElementById('rel-panel');
document.getElementById('btn-rel')?.addEventListener('click', () => {
  const visible = relPanel.style.display === 'block';
  relPanel.style.display = visible ? 'none' : 'block';
  document.getElementById('btn-rel').classList.toggle('active', !visible);
});

// Save / Load
document.getElementById('btn-save')?.addEventListener('click', () => game._saveLoad.save(1));
document.getElementById('btn-load')?.addEventListener('click', () => game._saveLoad.load(1));
