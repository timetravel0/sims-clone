import * as THREE from 'three';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';
import { bus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

// Re-export catalog derived from registry for UI
export const FURNITURE_CATALOG = () => ObjectRegistry.all();

export class BuildMode {
  constructor(world, scene, renderer, camera) {
    this._world    = world;
    this._scene    = scene;
    this._renderer = renderer;
    this._camera   = camera;
    this.active    = false;
    this._selected = null;
    this._ghost    = null;
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();
    renderer.domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
  }

  setActive(on) {
    this.active = on;
    if (!on && this._ghost) { this._scene.remove(this._ghost); this._ghost = null; }
    bus.emit('buildMode:changed', { active: on });
  }

  selectCatalogItem(item) {
    this._selected = item;
    if (this._ghost) this._scene.remove(this._ghost);
    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color: item.color, transparent: true, opacity: 0.55 });
    this._ghost = new THREE.Mesh(geo, mat);
    this._scene.add(this._ghost);
  }

  _onMouseMove(e) {
    if (!this.active || !this._ghost) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (hits.length > 0) {
      const p = hits[0].point;
      const gx = Math.round(p.x), gz = Math.round(p.z);
      this._ghost.position.set(gx, 0.3, gz);
      this._ghost.material.color.set(
        this._world.tilemap.isWalkable(gx, gz) ? this._selected.color : 0xff4444
      );
    }
  }

  handleClick(e) {
    if (!this._selected) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (hits.length > 0) {
      const p = hits[0].point;
      const gx = Math.round(p.x), gz = Math.round(p.z);
      const ok = this._world.placeFurniture({ ...this._selected, gx, gz });
      if (ok) Logger.info(`[Build] Placed ${this._selected.id} at (${gx},${gz})`);
      else    Logger.warn(`[Build] Cannot place at (${gx},${gz})`);
    }
  }
}
