export const TILE = { FLOOR: 0, WALL: 1, FURNITURE: 2 };

export class TileMap {
  constructor(width = 16, height = 16) {
    this.width = width;
    this.height = height;
    this._grid = Array.from({ length: height }, () => new Array(width).fill(TILE.FLOOR));
    for (let x = 0; x < width; x++) {
      this._grid[0][x] = TILE.WALL;
      this._grid[height - 1][x] = TILE.WALL;
    }
    for (let z = 0; z < height; z++) {
      this._grid[z][0] = TILE.WALL;
      this._grid[z][width - 1] = TILE.WALL;
    }
  }
  get(x, z) {
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return TILE.WALL;
    return this._grid[z][x];
  }
  set(x, z, type) {
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return;
    this._grid[z][x] = type;
  }
  isWalkable(x, z) { return this.get(x, z) === TILE.FLOOR; }
  worldToGrid(wx, wz) { return { x: Math.round(wx), z: Math.round(wz) }; }
  gridToWorld(gx, gz) { return { x: gx, y: 0, z: gz }; }
}
