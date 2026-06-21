import * as THREE from 'three';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

import { Game } from './core/Game.js';

const container = document.getElementById('canvas-container');
new Game(container, {
  // Tauri/desktop boot code may set this before loading main.js.
  // Browser/static builds leave it undefined and use LocalStorageAdapter.
  persistenceAdapter: window.__SIMS_PERSISTENCE_ADAPTER__ ?? null,
});
