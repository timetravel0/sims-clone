/**
 * BuildModeWalls — Sprint 5
 * Extends the existing BuildMode with wall/door placement tools.
 *
 * Sub-tools (set via setTool()):
 *   'furniture'  — original object placement (delegates to BuildMode)
 *   'wall'       — click two adjacent tiles to place a wall segment
 *   'door'       — click two adjacent tiles to place a door
 *   'eraser'     — click a wall/door edge to remove it
 *
 * Wall/door placement is two-click:
 *   1st click → sets anchor tile
 *   2nd click → if adjacent to anchor, places wall/door between them
 *
 * Ghost preview: a translucent wall mesh follows the mouse between anchor and hovered tile.
 *
 * Emits: buildMode:toolChanged { tool }
 */
import * as THREE  from 'three';
import { bus }     from '../core/EventBus.js';
import { budgetSystem } from '../systems/BudgetSystem.js';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';

const WALL_COST = 250;   // § per wall segment
const DOOR_COST = 500;   // § per door

const GHOST_WALL_COLOR = 0x88aaff;
const GHOST_DOOR_COLOR = 0xffcc44;
const GHOST_BAD_COLOR  = 0xff4444;

export class BuildModeWalls {
  /**
   * @param {BuildMode}   buildMode   original BuildMode instance
   * @param {WallManager} wallManager
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {IsometricCamera} camera
   * @param {World} world
   */
  constructor(buildMode, wallManager, scene, renderer, camera, world) {
    this._bm      = buildMode;
    this._wm      = wallManager;
    this._scene   = scene;
    this._renderer= renderer;
    this._camera  = camera;
    this._world   = world;

    this._tool    = 'furniture';  // current sub-tool
    this._anchor  = null;         // { gx, gz } — first click for wall/door
    this._ghost   = null;         // THREE.Mesh ghost preview
    this._hovered = null;         // { gx, gz } — tile under mouse
    this._moving  = null;         // { furniture, gx, gz } — piece being moved

    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();

    renderer.domElement.addEventListener('mousemove', this._onMove.bind(this));
  }

  // ── Tool selection ────────────────────────────────────────────────────────

  setTool(tool) {
    // Drop any in-progress move by putting the piece back
    if (this._moving) {
      this._world.placeFurniture({ ...this._moving.furniture, gx: this._moving.gx, gz: this._moving.gz });
      this._moving = null;
    }
    this._tool   = tool;
    this._anchor = null;
    this._removeGhost();
    bus.emit('buildMode:toolChanged', { tool });
  }

  get tool() { return this._tool; }

  // ── Mouse move ────────────────────────────────────────────────────────────

  _onMove(e) {
    if (!this._bm.active) return;
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y =-((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (!hits.length) return;
    const p  = hits[0].point;
    const gx = Math.round(p.x);
    const gz = Math.round(p.z);
    this._hovered = { gx, gz };

    if (this._tool === 'wall' || this._tool === 'door') {
      this._updateWallGhost(gx, gz);
    } else if (this._tool === 'move' && this._moving) {
      this._updateMoveGhost(gx, gz);
    }
  }

  _updateWallGhost(gx, gz) {
    this._removeGhost();
    if (!this._anchor) return;
    const { gx: ax, gz: az } = this._anchor;
    if (!this._isAdjacent(ax, az, gx, gz)) return;

    const color = this._canAfford() ? (this._tool === 'wall' ? GHOST_WALL_COLOR : GHOST_DOOR_COLOR) : GHOST_BAD_COLOR;
    const geo   = new THREE.BoxGeometry(1.0, 1.8, 0.1);
    const mat   = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5 });
    this._ghost = new THREE.Mesh(geo, mat);

    const mx   = (ax + gx) / 2;
    const mz   = (az + gz) / 2;
    const rotY = (az === gz) ? 0 : Math.PI / 2;
    this._ghost.position.set(mx, 0.9, mz);
    this._ghost.rotation.y = rotY;
    this._scene.add(this._ghost);
  }

  _updateMoveGhost(gx, gz) {
    this._removeGhost();
    const f = this._moving.furniture;
    const available = this._world.isCellAvailable(gx, gz);
    const color = available ? (f.color ?? 0x88ff88) : GHOST_BAD_COLOR;
    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.55 });
    this._ghost = new THREE.Mesh(geo, mat);
    this._ghost.position.set(gx, 0.3, gz);
    this._scene.add(this._ghost);
  }

  _removeGhost() {
    if (!this._ghost) return;
    this._scene.remove(this._ghost);
    this._ghost.geometry.dispose();
    this._ghost.material.dispose();
    this._ghost = null;
  }

  // ── Click handler (called from Game._setupInput when buildMode.active) ───

  handleClick(e) {
    if (this._tool === 'furniture') {
      this._bm.handleClick(e);
      return;
    }

    if (this._tool === 'move') {
      this._handleMoveClick(e);
      return;
    }

    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y =-((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (!hits.length) return;

    const p  = hits[0].point;
    const gx = Math.round(p.x);
    const gz = Math.round(p.z);

    if (this._tool === 'eraser') {
      // Try to erase wall/door on any adjacent edge near click
      this._eraseNear(gx, gz);
      return;
    }

    // wall / door — two-click flow
    if (!this._anchor) {
      this._anchor = { gx, gz };
      return;
    }
    const { gx: ax, gz: az } = this._anchor;
    this._anchor = null;
    this._removeGhost();

    if (!this._isAdjacent(ax, az, gx, gz)) return;

    const cost = this._tool === 'wall' ? WALL_COST : DOOR_COST;
    if (!budgetSystem.debit(cost, this._tool, { id: this._tool })) return;

    if (this._tool === 'wall') this._wm.placeWall(ax, az, gx, gz);
    else                       this._wm.placeDoor(ax, az, gx, gz);
  }

  _handleMoveClick(e) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y =-((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (!hits.length) return;
    const gx = Math.round(hits[0].point.x);
    const gz = Math.round(hits[0].point.z);

    if (!this._moving) {
      // Pick up: find furniture at this tile
      const f = this._world.furniture?.find(f => f.gx === gx && f.gz === gz);
      if (!f) return;
      this._moving = { furniture: { ...f }, gx: f.gx, gz: f.gz };
      this._world.removeFurniture(gx, gz);
      this._updateMoveGhost(gx, gz);
    } else {
      // Put down: place at new tile (or return to original if occupied)
      this._removeGhost();
      const ok = this._world.placeFurniture({ ...this._moving.furniture, gx, gz });
      if (!ok) {
        // Destination blocked — put back at origin
        this._world.placeFurniture({ ...this._moving.furniture, gx: this._moving.gx, gz: this._moving.gz });
      }
      this._moving = null;
    }
  }

  _eraseNear(gx, gz) {
    // 1. Furniture at the clicked tile
    const f = this._world.furniture?.find(f => f.gx === gx && f.gz === gz);
    if (f) {
      const cost = ObjectRegistry.get(f.id)?.cost ?? 0;
      this._world.removeFurniture(gx, gz);
      if (cost > 0) budgetSystem.sellRefund(cost);
      return;
    }

    // 2. Wall/door on any adjacent edge
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dz] of dirs) {
      const nx = gx + dx, nz = gz + dz;
      if (this._wm.hasWall(gx, gz, nx, nz) || this._wm.hasDoor(gx, gz, nx, nz)) {
        const wasWall = this._wm.hasWall(gx, gz, nx, nz);
        const removed = this._wm.removeEdge(gx, gz, nx, nz);
        if (removed) budgetSystem.sellRefund(wasWall ? WALL_COST : DOOR_COST);
        return;
      }
    }
  }

  _isAdjacent(x1, z1, x2, z2) {
    return (Math.abs(x1 - x2) === 1 && z1 === z2) ||
           (Math.abs(z1 - z2) === 1 && x1 === x2);
  }

  _canAfford() {
    const cost = this._tool === 'wall' ? WALL_COST : DOOR_COST;
    return budgetSystem.funds >= cost;
  }
}
