import * as THREE from 'three';

const ISO_ANGLE = Math.PI / 4;
const ZOOM = 12;

export class IsometricCamera {
  constructor(aspect) {
    const h = ZOOM, w = h * aspect;
    this.camera = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 200);
    this._target = new THREE.Vector3(8, 0, 8);
    this._reposition();
  }

  _reposition() {
    const dist = 30;
    const elev = Math.atan(1 / Math.sqrt(2)) * 1.5;
    this.camera.position.set(
      this._target.x + dist * Math.cos(ISO_ANGLE),
      dist * Math.tan(elev),
      this._target.z + dist * Math.sin(ISO_ANGLE)
    );
    this.camera.lookAt(this._target);
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect) {
    const h = ZOOM, w = h * aspect;
    this.camera.left = -w; this.camera.right = w;
    this.camera.top = h;   this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  onResize(aspect) { this.setAspect(aspect); }

  focusOn(x, z) {
    this._target.set(x, 0, z);
    this._reposition();
  }

  follow(worldPos) {
    this._target.lerp(worldPos, 0.05);
    this._reposition();
  }

  update(_dt) {}
}
