/**
 * Griglia 2D con conversione world/grid per tilemap isometrica.
 */
export class TileMap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tileSize = 1.1;
    this.tiles = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ walkable: true, type: 'grass', furniture: null }))
    );
    for (let i = 0; i < width; i++) {
      this.tiles[0][i].walkable = false; this.tiles[0][i].type = 'wall';
      this.tiles[height - 1][i].walkable = false; this.tiles[height - 1][i].type = 'wall';
    }
    for (let j = 0; j < height; j++) {
      this.tiles[j][0].walkable = false; this.tiles[j][0].type = 'wall';
      this.tiles[j][width - 1].walkable = false; this.tiles[j][width - 1].type = 'wall';
    }
  }
  gridToWorld(i, j) {
    return { x: i * this.tileSize, z: j * this.tileSize };
  }
  worldToGrid(x, z) {
    return { i: Math.round(x / this.tileSize), j: Math.round(z / this.tileSize) };
  }
  isWalkable(i, j) {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return false;
    return this.tiles[j][i].walkable && !this.tiles[j][i].furniture;
  }
}
