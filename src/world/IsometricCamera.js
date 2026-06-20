import * as THREE from 'three';

const ISO_ANGLE = Math.PI / 4;      // 45° horizontal
const ELEV_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.26° elevation
const ZOOM = 12;

export class IsometricCamera {
  constructor(aspect) {
    const h = ZOOM;
    const w = h * aspect;
    this.camera = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 200);
    this._target = new THREE.Vector3(8, 0, 8);
    this._reposition();
  }

  _reposition() {
    const dist = 30;
    this.camera.position.set(
      this._target.x + dist * Math.cos(ISO_ANGLE),
      dist * Math.tan(ELEV_ANGLE) * 1.5,
      this._target.z + dist * Math.sin(ISO_ANGLE)
    );
    this.camera.lookAt(this._target);
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect) {
    const h = ZOOM;
    const w = h * aspect;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly follow a target position */
  follow(worldPos) {
    this._target.lerp(worldPos, 0.05);
    this._reposition();
  }

  update(_dt) {}
}
