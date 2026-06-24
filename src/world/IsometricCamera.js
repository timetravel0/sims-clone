import * as THREE from 'three';

const ZOOM_DEFAULT = 12;
const ZOOM_MIN     = 5;
const ZOOM_MAX     = 30;
const ZOOM_STEP    = 1.5;
const ANGLE_STEP   = Math.PI / 2;  // 90° snapped rotation

export class IsometricCamera {
  constructor(aspect) {
    this._zoom   = ZOOM_DEFAULT;
    this._angle  = Math.PI / 4;    // initial 45° NW isometric
    this._target = new THREE.Vector3(8, 0, 8);
    this.camera  = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 200);
    this._applyAspect(aspect);
    this._reposition();
  }

  // ── Camera state ────────────────────────────────────────────────────────────

  _applyAspect(aspect) {
    const h = this._zoom, w = h * aspect;
    this.camera.left = -w; this.camera.right = w;
    this.camera.top  =  h; this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  _reposition() {
    const dist = 30;
    const elev = Math.atan(1 / Math.sqrt(2)) * 1.5;
    this.camera.position.set(
      this._target.x + dist * Math.cos(this._angle),
      dist * Math.tan(elev),
      this._target.z + dist * Math.sin(this._angle),
    );
    this.camera.lookAt(this._target);
    this.camera.updateProjectionMatrix();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  setAspect(aspect) { this._applyAspect(aspect); }
  onResize(aspect)  { this._applyAspect(aspect); }

  focusOn(x, z) {
    this._target.set(x, 0, z);
    this._reposition();
  }

  follow(worldPos) {
    this._target.lerp(worldPos, 0.05);
    this._reposition();
  }

  zoomIn()  { this._setZoom(this._zoom - ZOOM_STEP); }
  zoomOut() { this._setZoom(this._zoom + ZOOM_STEP); }

  rotateLeft()  { this._angle -= ANGLE_STEP; this._reposition(); }
  rotateRight() { this._angle += ANGLE_STEP; this._reposition(); }

  onWheel(delta) { delta > 0 ? this.zoomOut() : this.zoomIn(); }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _setZoom(z) {
    this._zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const aspect = this.camera.right / this.camera.top;
    this._applyAspect(aspect);
  }

  update(_dt) {}
}
