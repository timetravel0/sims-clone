import * as THREE from 'three';
import { bus } from '../core/EventBus.js';

/**
 * Door — occupies one tile, toggles between open/closed.
 * When closed: tile is WALL (blocks pathfinding).
 * When open:   tile is FLOOR (walkable).
 * Sims auto-open doors via DoorManager when a path crosses a door tile.
 */
export const DOOR_STATE = { CLOSED: 'closed', OPEN: 'open', OPENING: 'opening', CLOSING: 'closing' };

const ANIM_DURATION = 0.35; // seconds

export class Door {
  constructor({ gx, gz, axis = 'z', color = 0xb5813e }) {
    this.gx   = gx;
    this.gz   = gz;
    this.axis = axis; // 'x' = door swings along X wall, 'z' = Z wall
    this.state = DOOR_STATE.CLOSED;
    this._anim = 0;

    // Frame
    const frameGeo = new THREE.BoxGeometry(
      axis === 'z' ? 0.1 : 0.9,
      1.4,
      axis === 'z' ? 0.9 : 0.1
    );
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
    this.mesh = new THREE.Group();
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    this.mesh.add(frame);

    // Panel (the swinging part)
    const panelGeo = new THREE.BoxGeometry(
      axis === 'z' ? 0.06 : 0.85,
      1.2,
      axis === 'z' ? 0.85 : 0.06
    );
    const panelMat = new THREE.MeshLambertMaterial({ color });
    this._panel = new THREE.Mesh(panelGeo, panelMat);
    this._panel.castShadow = true;
    // Pivot at edge
    const pivot = new THREE.Group();
    pivot.position.set(
      axis === 'z' ? 0 : -0.4,
      0,
      axis === 'z' ? -0.4 : 0
    );
    this._panel.position.set(
      axis === 'z' ? 0 : 0.4,
      0,
      axis === 'z' ? 0.4 : 0
    );
    pivot.add(this._panel);
    this._pivot = pivot;
    this.mesh.add(pivot);

    this.mesh.position.set(gx, 0.7, gz);
  }

  /** Open or close the door */
  toggle() {
    if (this.state === DOOR_STATE.OPEN || this.state === DOOR_STATE.OPENING) {
      this.state = DOOR_STATE.CLOSING;
    } else {
      this.state = DOOR_STATE.OPENING;
      bus.emit('door:opening', { gx: this.gx, gz: this.gz });
    }
    this._anim = 0;
  }

  open()  { if (this.state !== DOOR_STATE.OPEN)   this.toggle(); }
  close() { if (this.state !== DOOR_STATE.CLOSED) this.toggle(); }

  get isOpen()   { return this.state === DOOR_STATE.OPEN; }
  get isWalkable() { return this.state === DOOR_STATE.OPEN || this.state === DOOR_STATE.OPENING; }

  update(dt) {
    if (this.state === DOOR_STATE.OPEN || this.state === DOOR_STATE.CLOSED) return;
    this._anim = Math.min(1, this._anim + dt / ANIM_DURATION);
    const eased = 1 - Math.pow(1 - this._anim, 3);
    const targetAngle = (this.state === DOOR_STATE.OPENING ? -Math.PI / 2 : 0);
    const startAngle  = (this.state === DOOR_STATE.OPENING ? 0 : -Math.PI / 2);
    if (this.axis === 'z') {
      this._pivot.rotation.y = startAngle + (targetAngle - startAngle) * eased;
    } else {
      this._pivot.rotation.y = startAngle + (targetAngle - startAngle) * eased;
    }
    if (this._anim >= 1) {
      this.state = this.state === DOOR_STATE.OPENING ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED;
      if (this.state === DOOR_STATE.CLOSED) bus.emit('door:closed', { gx: this.gx, gz: this.gz });
    }
  }
}
