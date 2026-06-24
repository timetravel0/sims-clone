/**
 * FurnitureMeshFactory — procedural 3D meshes for each furniture type.
 *
 * Philosophy:
 *   - Zero external assets: everything built from Three.js primitives.
 *   - Silhouette-first: instantly recognisable from the isometric view.
 *   - Poly budget: each object ≤ ~300 tris so 30+ objects stay smooth.
 *   - MeshLambertMaterial throughout (no specular, cheaper shading).
 *   - Every mesh group is centred at (0,0,0) at floor level — World.js
 *     positions the group via mesh.position.set(gx, 0, gz).
 *
 * Exported:
 *   FurnitureMeshFactory.build(id, color) → THREE.Group
 */

import * as THREE from 'three';

// ─── Shared material cache ────────────────────────────────────────────────────
const _matCache = new Map();
function mat(hex, opts = {}) {
  const key = `${hex}_${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
  }
  return _matCache.get(key);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, seg, color, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
  m.castShadow = true;
  return m;
}
function sphere(r, ws, hs, color, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color, opts));
  m.castShadow = true;
  return m;
}
function add(group, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * BED — frame + headboard + mattress + pillow
 * Footprint: 1×0.9 tiles (centred)
 */
function buildBed(accentColor) {
  const g = new THREE.Group();

  // Frame (dark wood)
  const frame = box(0.88, 0.14, 0.88, 0x5d4037);
  add(g, frame, 0, 0.07, 0);

  // Legs ×4
  const legH = 0.18;
  for (const [lx, lz] of [[-0.38,-0.38],[ 0.38,-0.38],[-0.38, 0.38],[ 0.38, 0.38]]) {
    const leg = cyl(0.04, 0.04, legH, 6, 0x4e342e);
    leg.position.set(lx, legH / 2, lz);
    g.add(leg);
  }

  // Mattress
  const mattress = box(0.78, 0.14, 0.82, accentColor ?? 0x7fb3d3);
  add(g, mattress, 0, 0.21, 0.02);

  // Pillow
  const pillow = box(0.32, 0.07, 0.2, 0xf5f5f5);
  add(g, pillow, 0, 0.29, -0.28);

  // Headboard (tall slab)
  const headboard = box(0.82, 0.44, 0.08, 0x5d4037);
  add(g, headboard, 0, 0.36, -0.44);

  // Footboard (shorter)
  const footboard = box(0.82, 0.2, 0.06, 0x5d4037);
  add(g, footboard, 0, 0.21, 0.44);

  return g;
}

/**
 * FRIDGE — body + handle + door accent + compressor bump
 */
function buildFridge(accentColor) {
  const g = new THREE.Group();

  // Main body
  const body = box(0.6, 1.1, 0.58, accentColor ?? 0xdceeff);
  add(g, body, 0, 0.55, 0);

  // Door seam line (thin dark strip)
  const seam = box(0.62, 0.005, 0.01, 0x888888);
  add(g, seam, 0, 0.72, 0.295);

  // Handle (small bar on door)
  const handle = box(0.04, 0.28, 0.05, 0xaaaaaa);
  add(g, handle, 0.22, 0.82, 0.32);

  // Compressor bump at base
  const comp = box(0.56, 0.12, 0.54, 0xbcbcbc);
  add(g, comp, 0, 0.06, 0);

  // Vent slots ×3 on bottom front
  for (let i = 0; i < 3; i++) {
    const slot = box(0.14, 0.025, 0.01, 0x666666);
    slot.position.set(-0.2 + i * 0.2, 0.08, 0.295);
    g.add(slot);
  }

  return g;
}

/**
 * TOILET — base + bowl + tank + seat lid
 */
function buildToilet(accentColor) {
  const g = new THREE.Group();

  const baseColor = accentColor ?? 0xf0f0e8;

  // Pedestal base
  const base = cyl(0.19, 0.22, 0.28, 10, baseColor);
  add(g, base, 0, 0.14, 0.08);

  // Bowl
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
    mat(baseColor)
  );
  bowl.rotation.x = Math.PI;
  bowl.position.set(0, 0.28, 0.08);
  bowl.castShadow = true;
  g.add(bowl);

  // Seat ring
  const seat = new THREE.Mesh(
    new THREE.TorusGeometry(0.175, 0.038, 6, 16),
    mat(0xddddcc)
  );
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 0.365, 0.08);
  g.add(seat);

  // Lid (flat oval-ish box)
  const lid = box(0.36, 0.04, 0.34, 0xddddcc);
  add(g, lid, 0, 0.39, 0.1);

  // Tank
  const tank = box(0.38, 0.32, 0.16, baseColor);
  add(g, tank, 0, 0.37, -0.2);

  // Flush button
  const btn = cyl(0.04, 0.04, 0.03, 8, 0xaaaaaa);
  add(g, btn, 0, 0.545, -0.2);

  return g;
}

/**
 * COUCH — base cushions + back cushions + armrests + legs
 */
function buildCouch(accentColor) {
  const g = new THREE.Group();
  const fabric = accentColor ?? 0xc9a96e;
  const dark   = 0x7a5c3a;

  // Seat base
  const seat = box(0.88, 0.18, 0.44, fabric);
  add(g, seat, 0, 0.28, 0.06);

  // Seat cushions ×2 (seam gap)
  for (const cx of [-0.22, 0.22]) {
    const cush = box(0.4, 0.1, 0.38, fabric);
    add(g, cush, cx, 0.38, 0.06);
  }

  // Back rest
  const back = box(0.88, 0.32, 0.12, fabric);
  add(g, back, 0, 0.51, -0.2);

  // Back cushions ×2
  for (const cx of [-0.22, 0.22]) {
    const bc = box(0.4, 0.26, 0.1, fabric);
    add(g, bc, cx, 0.5, -0.2);
  }

  // Armrests
  const arm = box(0.1, 0.32, 0.5, dark);
  add(g, arm.clone(), -0.44, 0.44, -0.06);
  add(g, arm, 0.44, 0.44, -0.06);

  // Legs ×4
  for (const [lx, lz] of [[-0.36,-0.1],[0.36,-0.1],[-0.36, 0.22],[0.36, 0.22]]) {
    const leg = cyl(0.03, 0.03, 0.2, 6, dark);
    leg.position.set(lx, 0.1, lz);
    g.add(leg);
  }

  return g;
}

/**
 * TV — stand + thin panel + bezel + screen glow
 */
function buildTV(accentColor) {
  const g = new THREE.Group();

  // Stand base (flat disc)
  const standBase = cyl(0.2, 0.22, 0.04, 12, 0x222222);
  add(g, standBase, 0, 0.02, 0);

  // Stand pole
  const pole = cyl(0.04, 0.04, 0.32, 8, 0x333333);
  add(g, pole, 0, 0.2, 0);

  // Neck (small horizontal mount)
  const neck = box(0.12, 0.06, 0.06, 0x333333);
  add(g, neck, 0, 0.37, 0);

  // Bezel (slightly larger than screen)
  const bezel = box(0.82, 0.5, 0.06, accentColor ?? 0x1a1a2e);
  add(g, bezel, 0, 0.68, 0);

  // Screen (slightly inset, glowing blue-grey)
  const screen = box(0.74, 0.42, 0.02, 0x1e2d4a, { emissive: 0x0d1a2e, emissiveIntensity: 0.5 });
  add(g, screen, 0, 0.68, 0.035);

  // Power LED
  const led = sphere(0.018, 4, 4, 0x44ff88, { emissive: 0x22aa44, emissiveIntensity: 1 });
  add(g, led, 0.35, 0.5, 0.04);

  return g;
}

/**
 * SHOWER — tray + walls (2 sides) + showerhead pipe + nozzle
 */
function buildShower(accentColor) {
  const g = new THREE.Group();
  const tileColor = accentColor ?? 0xa8d8ea;
  const chrome    = 0xcccccc;

  // Tray
  const tray = box(0.78, 0.06, 0.78, 0xe8e8e8);
  add(g, tray, 0, 0.03, 0);

  // Back wall
  const wallBack = box(0.78, 1.1, 0.06, tileColor);
  add(g, wallBack, 0, 0.61, -0.38);

  // Side wall
  const wallSide = box(0.06, 1.1, 0.78, tileColor);
  add(g, wallSide, -0.38, 0.61, 0);

  // Tile joints (subtle grid — 2 horizontal lines on back wall)
  for (const ly of [0.28, 0.62]) {
    const joint = box(0.78, 0.012, 0.005, 0x7bafc8);
    add(g, joint, 0, ly, -0.35);
  }

  // Pipe (vertical)
  const pipe = cyl(0.025, 0.025, 0.8, 6, chrome);
  add(g, pipe, -0.28, 0.61, -0.34);

  // Elbow (horizontal stub)
  const elbow = cyl(0.025, 0.025, 0.2, 6, chrome);
  elbow.rotation.z = Math.PI / 2;
  add(g, elbow, -0.19, 1.01, -0.34);

  // Nozzle head (disc)
  const nozzle = cyl(0.07, 0.07, 0.04, 10, chrome);
  nozzle.rotation.x = Math.PI / 2;
  add(g, nozzle, -0.08, 1.01, -0.34);

  // Glass door (transparent panel)
  const door = box(0.06, 1.1, 0.78, 0x8ecae6, { transparent: true, opacity: 0.22 });
  add(g, door, 0.38, 0.61, 0);

  return g;
}

/**
 * BOOKSHELF — carcass + shelves (3) + books
 */
function buildBookshelf(accentColor) {
  const g = new THREE.Group();
  const wood = accentColor ?? 0x8d6e63;

  // Back panel
  const back = box(0.72, 1.1, 0.06, wood);
  add(g, back, 0, 0.55, -0.32);

  // Left/right sides
  const side = box(0.06, 1.1, 0.6, wood);
  add(g, side.clone(), -0.37, 0.55, 0);
  add(g, side, 0.37, 0.55, 0);

  // Bottom
  const base = box(0.72, 0.06, 0.6, wood);
  add(g, base, 0, 0.03, 0);

  // Shelves ×3
  for (const sy of [0.32, 0.64, 0.94]) {
    const shelf = box(0.72, 0.04, 0.58, wood);
    add(g, shelf, 0, sy, 0);
  }

  // Books — randomised thin boxes per shelf
  const bookColors = [0xe57373, 0x81c784, 0x64b5f6, 0xffb74d, 0xba68c8, 0x4db6ac];
  const shelves = [0.14, 0.48, 0.76];
  for (const sy of shelves) {
    let cx = -0.3;
    while (cx < 0.3) {
      const w   = 0.04 + Math.random() * 0.05;
      const h   = 0.14 + Math.random() * 0.1;
      const col = bookColors[Math.floor(Math.random() * bookColors.length)];
      const bk  = box(w, h, 0.22, col);
      bk.position.set(cx + w / 2, sy + h / 2, 0.05);
      g.add(bk);
      cx += w + 0.01;
    }
  }

  return g;
}

/**
 * DESK — legs (×4) + desktop + monitor + keyboard
 */
function buildDesk(accentColor) {
  const g = new THREE.Group();
  const wood   = accentColor ?? 0xa1887f;
  const dark   = 0x4e342e;
  const chrome = 0xbbbbbb;

  // Legs ×4
  for (const [lx, lz] of [[-0.36,-0.22],[0.36,-0.22],[-0.36,0.22],[0.36,0.22]]) {
    const leg = cyl(0.03, 0.03, 0.62, 6, dark);
    leg.position.set(lx, 0.31, lz);
    g.add(leg);
  }

  // Desktop surface
  const top = box(0.78, 0.05, 0.5, wood);
  add(g, top, 0, 0.645, 0);

  // Monitor base
  const mBase = box(0.18, 0.04, 0.14, chrome);
  add(g, mBase, 0, 0.685, -0.1);

  // Monitor pole
  const mPole = box(0.04, 0.2, 0.04, chrome);
  add(g, mPole, 0, 0.8, -0.1);

  // Monitor bezel
  const bezel = box(0.4, 0.28, 0.04, 0x222222);
  add(g, bezel, 0, 0.94, -0.1);

  // Screen
  const screen = box(0.36, 0.24, 0.02, 0x1a2340, { emissive: 0x0a1020, emissiveIntensity: 0.4 });
  add(g, screen, 0, 0.94, -0.09);

  // Keyboard
  const kb = box(0.32, 0.025, 0.14, 0x444444);
  add(g, kb, 0, 0.675, 0.1);

  return g;
}

/**
 * PIANO — body + lid + keys strip + legs
 */
function buildPiano(accentColor) {
  const g = new THREE.Group();
  const bodyColor = accentColor ?? 0x212121;
  const ivory     = 0xf8f4e8;

  // Body
  const body = box(0.82, 0.56, 0.52, bodyColor);
  add(g, body, 0, 0.36, 0);

  // Lid (angled slab on top — slightly larger, offset)
  const lid = box(0.84, 0.04, 0.54, bodyColor);
  lid.rotation.x = -0.15;
  add(g, lid, 0, 0.66, -0.04);

  // Keyboard strip (white base)
  const keys = box(0.76, 0.06, 0.18, ivory);
  add(g, keys, 0, 0.36, 0.3);

  // Black keys (6 thin rectangles)
  const bkGroups = [[-0.27,-0.18,-0.06, 0.04, 0.14, 0.23]];
  for (const kx of [-0.27,-0.18,-0.06, 0.04, 0.14, 0.23]) {
    const bk = box(0.05, 0.07, 0.1, 0x111111);
    add(g, bk, kx, 0.41, 0.26);
  }

  // Pedal bar
  const pedalBar = box(0.22, 0.03, 0.06, 0xaaaaaa);
  add(g, pedalBar, 0, 0.045, 0.18);

  // Legs ×3
  for (const lx of [-0.32, 0, 0.32]) {
    const leg = cyl(0.04, 0.04, 0.46, 6, bodyColor);
    leg.position.set(lx, 0.23, -0.18);
    g.add(leg);
  }

  return g;
}

/**
 * TREADMILL — base deck + side rails + display console + belt (dark strip) + rollers
 */
function buildTreadmill(accentColor) {
  const g = new THREE.Group();
  const bodyColor = accentColor ?? 0xb0bec5;
  const dark      = 0x37474f;

  // Deck base
  const deck = box(0.7, 0.12, 0.5, dark);
  add(g, deck, 0, 0.06, 0);

  // Belt (dark strip on top)
  const belt = box(0.56, 0.01, 0.44, 0x222222);
  add(g, belt, 0, 0.13, 0);

  // Side rails
  for (const lx of [-0.36, 0.36]) {
    const rail = box(0.06, 0.82, 0.06, bodyColor);
    rail.position.set(lx, 0.53, -0.1);
    g.add(rail);
    // horizontal grip
    const grip = box(0.06, 0.06, 0.32, bodyColor);
    grip.position.set(lx, 0.92, 0.04);
    g.add(grip);
  }

  // Crossbar connecting rails
  const cross = box(0.66, 0.05, 0.05, bodyColor);
  add(g, cross, 0, 0.93, 0.04);

  // Console display
  const console_ = box(0.38, 0.2, 0.06, 0x263238);
  add(g, console_, 0, 0.86, 0.05);
  const screen_ = box(0.3, 0.13, 0.02, 0x102030, { emissive: 0x061018, emissiveIntensity: 0.5 });
  add(g, screen_, 0, 0.87, 0.085);

  // Rollers front/back
  for (const lz of [-0.24, 0.24]) {
    const roller = cyl(0.055, 0.055, 0.6, 8, 0x888888);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 0.115, lz);
    g.add(roller);
  }

  return g;
}

/**
 * WORKBENCH — heavy base + work surface + pegboard back + tool silhouettes
 */
function buildWorkbench(accentColor) {
  const g = new THREE.Group();
  const wood   = accentColor ?? 0x90a4ae;
  const metal  = 0x78909c;
  const dark   = 0x455a64;

  // Two heavy base frames
  for (const lx of [-0.28, 0.28]) {
    const frame = box(0.12, 0.58, 0.48, dark);
    frame.position.set(lx, 0.29, 0);
    g.add(frame);
  }

  // Work surface
  const top = box(0.76, 0.06, 0.5, wood);
  add(g, top, 0, 0.62, 0);

  // Pegboard back panel
  const board = box(0.76, 0.52, 0.05, 0xcfd8dc);
  add(g, board, 0, 0.91, -0.25);

  // Peg holes: 3×2 grid of small dark dots
  for (let px = -1; px <= 1; px++) {
    for (const py of [0.76, 0.98]) {
      const peg = cyl(0.02, 0.02, 0.03, 5, 0x90a4ae);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(px * 0.2, py, -0.22);
      g.add(peg);
    }
  }

  // Tool silhouettes: hammer + wrench (simplified)
  // Hammer handle
  const hHandle = cyl(0.025, 0.025, 0.28, 6, 0x8d6e63);
  hHandle.rotation.z = 0.3;
  add(g, hHandle, -0.15, 0.88, -0.22);
  // Hammer head
  const hHead = box(0.1, 0.06, 0.04, metal);
  add(g, hHead, -0.15, 1.0, -0.22);

  // Wrench
  const wBar = box(0.22, 0.04, 0.03, metal);
  wBar.rotation.z = 0.5;
  add(g, wBar, 0.12, 0.9, -0.22);

  return g;
}

/** COUNTER — kitchen base cabinet + countertop slab + drawer seams */
function buildCounter(accent) {
  const g = new THREE.Group();
  add(g, box(0.92, 0.7, 0.5, accent ?? 0xcfd8dc), 0, 0.35, 0);
  add(g, box(0.98, 0.06, 0.56, 0xeceff1), 0, 0.71, 0);
  for (const dy of [0.5, 0.32]) add(g, box(0.8, 0.01, 0.012, 0x90a4ae), 0, dy, 0.255);
  return g;
}

/** STOVE — body + cooktop with 4 burners + oven door + knobs */
function buildStove(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0xb0bec5;
  add(g, box(0.9, 0.7, 0.5, c), 0, 0.35, 0);
  add(g, box(0.94, 0.06, 0.54, 0x90a4ae), 0, 0.71, 0);
  for (const [bx, bz] of [[-0.2,-0.12],[0.2,-0.12],[-0.2,0.14],[0.2,0.14]])
    add(g, cyl(0.1, 0.1, 0.02, 12, 0x37474f), bx, 0.75, bz);
  add(g, box(0.7, 0.36, 0.02, 0x607d8b), 0, 0.3, 0.255);
  add(g, box(0.5, 0.04, 0.04, 0xcccccc), 0, 0.5, 0.27);
  for (const kx of [-0.3,-0.1,0.1,0.3]) add(g, cyl(0.03, 0.03, 0.03, 8, 0x37474f), kx, 0.56, 0.255);
  return g;
}

/** SINK — cabinet + basin block with inset + faucet */
function buildSink(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0xcfd8dc;
  add(g, box(0.5, 0.5, 0.4, c), 0, 0.25, 0);
  add(g, box(0.56, 0.12, 0.46, 0xeceff1), 0, 0.56, 0);
  add(g, box(0.4, 0.04, 0.3, 0x90a4ae), 0, 0.6, 0);
  add(g, cyl(0.02, 0.02, 0.18, 6, 0xbbbbbb), 0, 0.68, -0.12);
  const spout = cyl(0.02, 0.02, 0.12, 6, 0xbbbbbb); spout.rotation.x = Math.PI / 2;
  add(g, spout, 0, 0.76, -0.06);
  return g;
}

/** DINING TABLE — top + 4 legs + 2 simple chairs */
function buildDiningTable(accent) {
  const g = new THREE.Group();
  const wood = accent ?? 0x8d6e63;
  add(g, box(0.95, 0.06, 0.6, wood), 0, 0.6, 0);
  for (const [lx, lz] of [[-0.4,-0.24],[0.4,-0.24],[-0.4,0.24],[0.4,0.24]]) {
    const leg = cyl(0.04, 0.04, 0.58, 6, 0x5d4037); leg.position.set(lx, 0.29, lz); g.add(leg);
  }
  for (const cz of [-0.42, 0.42]) {
    add(g, box(0.3, 0.04, 0.3, 0x6d4c41), 0, 0.34, cz);
    add(g, box(0.3, 0.3, 0.04, 0x6d4c41), 0, 0.5, cz + (cz < 0 ? -0.13 : 0.13));
  }
  return g;
}

/** BAR — base cabinet + overhang top + foot rail + 2 stools */
function buildBar(accent) {
  const g = new THREE.Group();
  const wood = accent ?? 0x6d4c41;
  add(g, box(0.9, 0.7, 0.4, wood), 0, 0.35, -0.05);
  add(g, box(1.0, 0.06, 0.56, 0x8d6e63), 0, 0.71, 0.02);
  const rail = cyl(0.02, 0.02, 0.9, 6, 0xbbbbbb); rail.rotation.z = Math.PI / 2;
  add(g, rail, 0, 0.12, 0.22);
  for (const sx of [-0.28, 0.28]) {
    add(g, cyl(0.12, 0.12, 0.05, 12, 0x333333), sx, 0.46, 0.3);
    add(g, cyl(0.03, 0.03, 0.44, 6, 0x777777), sx, 0.23, 0.3);
  }
  return g;
}

/** CHESS TABLE — pedestal + checkered top + a few pieces */
function buildChess(accent) {
  const g = new THREE.Group();
  add(g, cyl(0.06, 0.1, 0.4, 8, 0x5d4037), 0, 0.2, 0);
  add(g, box(0.5, 0.05, 0.5, accent ?? 0x8d6e63), 0, 0.43, 0);
  add(g, box(0.46, 0.012, 0.46, 0xf0f0e0), 0, 0.46, 0);
  for (const [px, pz, col] of [[-0.15,-0.15,0x222222],[0.12,0.1,0xeeeeee],[0.0,-0.05,0x222222]])
    add(g, cyl(0.03, 0.04, 0.1, 8, col), px, 0.51, pz);
  return g;
}

/** LAMP — base disc + pole + conical shade + glowing bulb */
function buildLamp(accent) {
  const g = new THREE.Group();
  add(g, cyl(0.14, 0.16, 0.04, 12, 0x444444), 0, 0.02, 0);
  add(g, cyl(0.02, 0.02, 0.9, 6, 0x888888), 0, 0.47, 0);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 12, 1, true),
    mat(accent ?? 0xffe082, { side: THREE.DoubleSide })); shade.position.y = 0.98; shade.castShadow = true;
  g.add(shade);
  add(g, sphere(0.06, 8, 8, 0xfff59d, { emissive: 0xffee58, emissiveIntensity: 0.9 }), 0, 0.92, 0);
  return g;
}

/** PHONE — small side table + upright handset with a glowing screen */
function buildPhone(accent) {
  const g = new THREE.Group();
  add(g, cyl(0.08, 0.1, 0.5, 8, 0x5d4037), 0, 0.25, 0);
  add(g, box(0.3, 0.04, 0.3, 0x6d4c41), 0, 0.5, 0);
  add(g, box(0.1, 0.22, 0.03, accent ?? 0x263238), 0, 0.63, 0);
  add(g, box(0.08, 0.16, 0.01, 0x4fc3f7, { emissive: 0x0277bd, emissiveIntensity: 0.4 }), 0, 0.64, 0.02);
  return g;
}

/** FIRE PIT — stone ring + crossed logs + emissive flame */
function buildFirePit(accent) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), mat(accent ?? 0x757575));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.castShadow = true; g.add(ring);
  for (const rot of [0.5, -0.5]) {
    const log = cyl(0.04, 0.04, 0.4, 6, 0x6d4c41); log.rotation.z = Math.PI / 2; log.rotation.y = rot;
    log.position.y = 0.1; g.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 8),
    mat(0xff7043, { emissive: 0xff5722, emissiveIntensity: 0.8 })); flame.position.y = 0.28; g.add(flame);
  return g;
}

/** HOT TUB — round tub + rim + glowing water surface */
function buildHotTub(accent) {
  const g = new THREE.Group();
  add(g, cyl(0.46, 0.46, 0.4, 16, accent ?? 0x6d4c41), 0, 0.2, 0);
  add(g, cyl(0.5, 0.5, 0.06, 16, 0x8d6e63), 0, 0.4, 0);
  add(g, cyl(0.42, 0.42, 0.04, 16, 0x4dd0e1, { transparent: true, opacity: 0.85, emissive: 0x0097a7, emissiveIntensity: 0.2 }), 0, 0.39, 0);
  return g;
}

// ─── Crafted-object shapes (keyed by needTarget; one silhouette per craft type) ─

/** GADGET (fun) — boxy device + screen + antenna */
function buildGadget(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0x8d6e63;
  add(g, box(0.4, 0.3, 0.4, c), 0, 0.2, 0);
  add(g, box(0.3, 0.12, 0.02, 0x4fc3f7, { emissive: 0x0277bd, emissiveIntensity: 0.5 }), 0, 0.26, 0.205);
  add(g, cyl(0.01, 0.01, 0.3, 5, 0x999999), 0.12, 0.5, 0);
  add(g, sphere(0.04, 6, 6, 0xff5252, { emissive: 0xd32f2f, emissiveIntensity: 0.6 }), 0.12, 0.66, 0);
  return g;
}

/** STOOL (comfort) — round seat + 4 legs */
function buildStool(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0x8d6e63;
  add(g, cyl(0.2, 0.2, 0.07, 16, c), 0, 0.45, 0);
  for (const [lx, lz] of [[-0.13,-0.13],[0.13,-0.13],[-0.13,0.13],[0.13,0.13]]) {
    const leg = cyl(0.02, 0.02, 0.42, 6, 0x5d4037); leg.position.set(lx, 0.21, lz); g.add(leg);
  }
  return g;
}

/** SCULPTURE (room) — pedestal + column + abstract orb & ring */
function buildSculpture(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0x8d6e63;
  add(g, box(0.3, 0.1, 0.3, 0x9e9e9e), 0, 0.05, 0);
  add(g, cyl(0.08, 0.1, 0.3, 8, 0x9e9e9e), 0, 0.25, 0);
  add(g, sphere(0.16, 12, 12, c), 0, 0.56, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 16), mat(c));
  ring.position.y = 0.56; ring.rotation.x = 0.6; ring.castShadow = true; g.add(ring);
  return g;
}

/** RECLINER (energy) — seat + reclined back + footrest + armrests */
function buildRecliner(accent) {
  const g = new THREE.Group();
  const c = accent ?? 0x8d6e63;
  add(g, box(0.6, 0.16, 0.6, c), 0, 0.22, 0.05);
  const back = box(0.6, 0.5, 0.14, c); back.rotation.x = -0.4; add(g, back, 0, 0.45, -0.28);
  add(g, box(0.6, 0.12, 0.25, c), 0, 0.16, 0.42);
  for (const [lx, lz] of [[-0.26,-0.2],[0.26,-0.2],[-0.26,0.28],[0.26,0.28]]) {
    const leg = cyl(0.03, 0.03, 0.16, 6, 0x4e342e); leg.position.set(lx, 0.08, lz); g.add(leg);
  }
  add(g, box(0.1, 0.3, 0.5, c), -0.34, 0.3, 0);
  add(g, box(0.1, 0.3, 0.5, c), 0.34, 0.3, 0);
  return g;
}

// ─── Social indicator ring (unchanged from original Furniture.js) ─────────────
export function addSocialRing(group) {
  const ringGeo = new THREE.RingGeometry(0.38, 0.44, 20);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd54f, side: THREE.DoubleSide, transparent: true, opacity: 0.7,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
}

// ─── Public API ───────────────────────────────────────────────────────────────
const BUILDERS = {
  bed          : buildBed,
  fridge       : buildFridge,
  toilet       : buildToilet,
  couch        : buildCouch,
  tv           : buildTV,
  shower       : buildShower,
  bookshelf    : buildBookshelf,
  desk         : buildDesk,
  piano        : buildPiano,
  treadmill    : buildTreadmill,
  workbench    : buildWorkbench,
  counter      : buildCounter,
  stove        : buildStove,
  sink         : buildSink,
  dining_table : buildDiningTable,
  bar          : buildBar,
  chess        : buildChess,
  lamp         : buildLamp,
  phone        : buildPhone,
  fire_pit     : buildFirePit,
  hot_tub      : buildHotTub,
};

// Crafted objects share a single id space (`custom_object_*`), so they pick a
// silhouette by the need they serve — one shape per craft type (CRAFT_NOUNS).
const CRAFT_BUILDERS = {
  fun     : buildGadget,
  comfort : buildStool,
  room    : buildSculpture,
  energy  : buildRecliner,
};

export class FurnitureMeshFactory {
  /**
   * @param {string} id         — furniture type id (e.g. 'bed', 'fridge')
   * @param {number} color      — accent color hex (optional — builder picks a default)
   * @param {string} [needTarget] — for crafted objects, selects the craft shape
   * @returns {THREE.Group}
   */
  static build(id, color, needTarget) {
    let builder = BUILDERS[id];
    // Crafted objects (and any other id without its own builder) get a shape from
    // the need they serve, so they're never a featureless cube.
    if (!builder) builder = CRAFT_BUILDERS[needTarget];
    if (!builder) {
      const g = new THREE.Group();
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.8),
        new THREE.MeshLambertMaterial({ color: color ?? 0xaaaaaa })
      );
      fallback.position.y = 0.3;
      fallback.castShadow = true;
      g.add(fallback);
      return g;
    }
    return builder(color);
  }
}
