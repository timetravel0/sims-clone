import { Door } from './Door.js';
import { TILE } from './TileMap.js';
import { bus } from '../core/EventBus.js';

/**
 * DoorManager — owns all doors, updates them, and patches the tilemap
 * so the A* pathfinder sees open doors as walkable.
 */
export class DoorManager {
  constructor(world) {
    this._world = world;
    this._doors = []; // Door[]

    // When a Sim arrives at a door tile, auto-open it
    bus.on('sim:arrived', ({ gx, gz }) => {
      const door = this.doorAt(gx, gz);
      if (door) door.open();
    });
  }

  /** Place a door at grid position */
  addDoor(opts) {
    const door = new Door(opts);
    this._doors.push(door);
    this._world.scene.add(door.mesh);
    this._patchTile(door);
    return door;
  }

  doorAt(gx, gz) {
    return this._doors.find(d => d.gx === gx && d.gz === gz) || null;
  }

  /** Expose doors array */
  get doors() { return this._doors; }

  update(dt) {
    for (const d of this._doors) {
      const wasClosed = !d.isWalkable;
      d.update(dt);
      // Patch tilemap when state changes
      if (wasClosed !== !d.isWalkable) this._patchTile(d);
    }
  }

  _patchTile(door) {
    this._world.tilemap.set(
      door.gx, door.gz,
      door.isWalkable ? TILE.FLOOR : TILE.WALL
    );
  }

  /**
   * Intercept a path: if it crosses a closed door, open it before
   * the Sim reaches that step. Returns a new path with a "stop-and-wait"
   * WalkTo inserted before the door tile.
   */
  resolvePath(path, onDoorFound) {
    for (let i = 0; i < path.length; i++) {
      const door = this.doorAt(path[i].x, path[i].z);
      if (door && !door.isOpen) {
        door.open();
        if (onDoorFound) onDoorFound(door);
      }
    }
    return path;
  }
}
