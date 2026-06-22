import * as THREE from 'three';
import { Game } from './core/Game.js';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

// The app runs as a web app (served by Vite, opened in Chrome via `npm run app`).
// Persistence is real SQLite in the browser through sql.js (WASM) on OPFS;
// if OPFS is unavailable we fall back to LocalStorageAdapter (see SaveLoad).
async function resolvePersistenceAdapter() {
  if (window.__SIMS_PERSISTENCE_ADAPTER__) return window.__SIMS_PERSISTENCE_ADAPTER__;
  try {
    const { SqlJsAdapter } = await import('./persistence/SqlJsAdapter.js');
    if (SqlJsAdapter.available()) {
      const adapter = await new SqlJsAdapter().connect();
      window.__SIMS_PERSISTENCE_ADAPTER__ = adapter;
      console.info('[Persistence] SQLite (sql.js + OPFS) enabled.');
      return adapter;
    }
  } catch (err) {
    console.error('[Persistence] sql.js init failed; falling back to LocalStorageAdapter.', err);
  }
  return null;
}

const container = document.getElementById('canvas-container');
const persistenceAdapter = await resolvePersistenceAdapter();
new Game(container, { persistenceAdapter });
