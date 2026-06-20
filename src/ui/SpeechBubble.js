/**
 * HTML speech bubble anchored above a Sim.
 * Position is updated every frame by projecting world coords to screen.
 */
export class SpeechBubble {
  constructor(simName) {
    this._el = document.createElement('div');
    this._el.className = 'speech-bubble';
    this._el.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'background:rgba(20,18,14,0.88)',
      'border:1px solid rgba(255,255,255,0.15)',
      'color:#eee',
      'font-size:12px',
      'padding:4px 10px',
      'border-radius:999px',
      'white-space:nowrap',
      'transform:translate(-50%,-100%)',
      'opacity:0',
      'transition:opacity 0.25s',
      'z-index:100',
    ].join(';');
    document.body.appendChild(this._el);
    this._visible = false;
    this._timer   = 0;
  }

  show(text, _worldPos, duration = 3) {
    this._el.textContent = text;
    this._el.style.opacity = '1';
    this._visible = true;
    this._timer   = duration;
  }

  /**
   * @param {THREE.Vector3} worldPos - sim mesh world position
   * We approximate screen position via the camera stored on window._game
   */
  update(dt, worldPos) {
    if (!this._visible) return;
    this._timer -= dt;
    if (this._timer <= 0) {
      this._el.style.opacity = '0';
      this._visible = false;
      return;
    }

    // Project world position to NDC using game camera
    const game = window._game;
    if (!game) return;
    const cam = game.dayNight ? game._camera?.camera : null;
    if (!cam) return;

    // Use a simple top-offset heuristic (isometric projection is stable)
    // Actual screen projection via THREE Vector3.project
    const v = worldPos.clone();
    v.y += 1.2; // above head
    v.project(game._camera.camera);

    const x = ( v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this._el.style.left = `${x}px`;
    this._el.style.top  = `${y}px`;
  }

  destroy() { this._el.remove(); }
}
