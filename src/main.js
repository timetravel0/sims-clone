import * as THREE from 'three';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

import { Game } from './core/Game.js';

const container = document.getElementById('canvas-container');
new Game(container);
