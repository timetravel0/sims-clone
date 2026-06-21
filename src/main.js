import * as THREE from 'three';
import { Game } from './core/Game.js';
import { SQLiteAdapter } from './persistence/SQLiteAdapter.js';

// Expose THREE globally so ContextMenu and other modules can use it
// without creating a circular import chain.
window._THREE = THREE;

function isTauriRuntime() {
  return !!(
    window.__TAURI_INTERNALS__ ||
    window.__TAURI__ ||
    navigator.userAgent.includes('Tauri')
  );
}

async function createTauriSQLiteAdapter() {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const dbUrl = window.__SIMS_SQLITE_URL__ ?? 'sqlite:sims-clone.db';
  const runId = window.__SIMS_RUN_ID__ ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const db = await Database.load(dbUrl);
  return new SQLiteAdapter({ db, runId }).connect();
}

async function resolvePersistenceAdapter() {
  if (window.__SIMS_PERSISTENCE_ADAPTER__) return window.__SIMS_PERSISTENCE_ADAPTER__;
  if (!isTauriRuntime()) return null;
  try {
    const adapter = await createTauriSQLiteAdapter();
    window.__SIMS_PERSISTENCE_ADAPTER__ = adapter;
    console.info('[Persistence] SQLiteAdapter enabled for Tauri runtime.');
    return adapter;
  } catch (err) {
    console.error('[Persistence] Failed to enable SQLiteAdapter; falling back to LocalStorageAdapter.', err);
    return null;
  }
}

const container = document.getElementById('canvas-container');
const persistenceAdapter = await resolvePersistenceAdapter();
new Game(container, { persistenceAdapter });
