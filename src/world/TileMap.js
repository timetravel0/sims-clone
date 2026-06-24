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
  expand(direction, tiles = 8) {
    if (direction === 'right') {
      const newW = this.width + tiles;
      for (let z = 1; z < this.height - 1; z++) this._grid[z][this.width - 1] = TILE.FLOOR;
      for (let z = 0; z < this.height; z++)
        for (let x = this.width; x < newW; x++)
          this._grid[z].push((z === 0 || z === this.height - 1 || x === newW - 1) ? TILE.WALL : TILE.FLOOR);
      this.width = newW;
    } else if (direction === 'bottom') {
      const newH = this.height + tiles;
      for (let x = 1; x < this.width - 1; x++) this._grid[this.height - 1][x] = TILE.FLOOR;
      for (let z = this.height; z < newH; z++) {
        const isEdge = z === newH - 1;
        this._grid.push(Array.from({ length: this.width }, (_, x) =>
          (isEdge || x === 0 || x === this.width - 1) ? TILE.WALL : TILE.FLOOR));
      }
      this.height = newH;
    } else if (direction === 'left') {
      const newW = this.width + tiles;
      for (let z = 1; z < this.height - 1; z++) this._grid[z][0] = TILE.FLOOR;
      for (let z = 0; z < this.height; z++) {
        const newRow = Array.from({ length: tiles }, (_, i) =>
          (z === 0 || z === this.height - 1 || i === 0) ? TILE.WALL : TILE.FLOOR);
        this._grid[z].unshift(...newRow);
      }
      this.width = newW;
    } else if (direction === 'top') {
      const newH = this.height + tiles;
      for (let x = 1; x < this.width - 1; x++) this._grid[0][x] = TILE.FLOOR;
      const newRows = Array.from({ length: tiles }, (_, i) =>
        Array.from({ length: this.width }, (__, x) =>
          (i === 0 || x === 0 || x === this.width - 1) ? TILE.WALL : TILE.FLOOR));
      this._grid.unshift(...newRows);
      this.height = newH;
    }
  }

  randomWalkable() {
    const walkable = [];
    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isWalkable(x, z)) walkable.push({ x, z });
      }
    }
    if (walkable.length === 0) return null;
    return walkable[Math.floor(Math.random() * walkable.length)];
  }
}
