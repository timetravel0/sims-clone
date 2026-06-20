import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

export const FURNITURE_CATALOG = [
  { id: 'bed',    label: 'Bed',    color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
  { id: 'fridge', label: 'Fridge', color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
  { id: 'toilet', label: 'Toilet', color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
  { id: 'couch',  label: 'Couch',  color: 0xc9a96e, needTarget: 'comfort', restoreRate: 20 },
  { id: 'tv',     label: 'TV',     color: 0x1a1a2e, needTarget: 'fun',     restoreRate: 20 },
  { id: 'shower', label: 'Shower', color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
  { id: 'lamp',   label: 'Lamp',   color: 0xffdd88, needTarget: 'room',    restoreRate: 10 },
];

export class BuildMode {
  constructor(world, scene, renderer, camera) {
    this._world    = world;
    this._scene    = scene;
    this._renderer = renderer;
    this._camera   = camera;
    this.active    = false;
    this._selected = null; // catalog item
    this._ghost    = null; // preview mesh
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();

    renderer.domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
  }

  setActive(on) {
    this.active = on;
    if (!on && this._ghost) {
      this._scene.remove(this._ghost);
      this._ghost = null;
    }
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
      const walkable = this._world.tilemap.isWalkable(gx, gz);
      this._ghost.material.color.set(walkable ? this._selected.color : 0xff4444);
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
      else Logger.warn(`[Build] Cannot place ${this._selected.id} at (${gx},${gz})`);
    }
  }
}
