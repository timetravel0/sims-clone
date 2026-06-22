import * as THREE from 'three';
import { Game } from './core/Game.js';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

// The app runs as a web app (served by Vite, opened in Chrome via `npm run app`).
// Persistence is real SQLite through sql.js. Under `npm run app`, a local Node
// companion writes the DB to .data/sims-clone.sqlite automatically; otherwise
// SqlJsAdapter falls back to OPFS / File System Access / memory as available.
async function resolvePersistenceAdapter() {
  if (window.__SIMS_PERSISTENCE_ADAPTER__) return window.__SIMS_PERSISTENCE_ADAPTER__;
  try {
    const { SqlJsAdapter } = await import('./persistence/SqlJsAdapter.js');
    const adapter = await new SqlJsAdapter().connect();
    window.__SIMS_PERSISTENCE_ADAPTER__ = adapter;
    console.info('[Persistence] SQLite (sql.js) enabled. Use await window._simsPersistenceInfo() for diagnostics.');
    return adapter;
  } catch (err) {
    console.error('[Persistence] sql.js init failed; falling back to LocalStorageAdapter.', err);
  }
  return null;
}

async function boot() {
  const container = document.getElementById('canvas-container');
  const persistenceAdapter = await resolvePersistenceAdapter();

  window._simsPersistence = persistenceAdapter ?? null;
  window._simsPersistenceInfo = async () => {
    const sl = window._game?._saveLoad;
    if (sl?.backendInfo) return sl.backendInfo();
    if (persistenceAdapter?.diagnostics) return persistenceAdapter.diagnostics();
    return { backend: 'LocalStorageAdapter', sqlite: false };
  };

  window._game = new Game(container, { persistenceAdapter });
}

boot().catch(err => {
  console.error('[Main] boot failed', err);
});
