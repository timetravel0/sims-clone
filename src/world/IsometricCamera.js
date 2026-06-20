import * as THREE from 'three';

/**
 * Camera ortografica posizionata per vista isometrica classica.
 */
export class IsometricCamera {
  constructor(width, height) {
    const aspect = width / height;
    const d = 18;
    this._camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 200);
    this._camera.position.set(20, 20, 20);
    this._camera.lookAt(10, 0, 10);
    this._camera.zoom = 1;
    this._camera.updateProjectionMatrix();
  }
  get camera() { return this._camera; }
  resize(width, height) {
    const aspect = width / height;
    const d = 18;
    this._camera.left = -d * aspect;
    this._camera.right = d * aspect;
    this._camera.top = d;
    this._camera.bottom = -d;
    this._camera.updateProjectionMatrix();
  }
}
