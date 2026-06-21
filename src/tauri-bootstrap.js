import * as THREE from 'three';
import Database from '@tauri-apps/plugin-sql';
import { SQLiteAdapter } from './persistence/SQLiteAdapter.js';

// Expose THREE globally so ContextMenu and other modules can use it without
// creating a circular import chain. This mirrors src/main.js.
window._THREE = THREE;

async function createPersistenceAdapter() {
  const dbUrl = window.__SIMS_SQLITE_URL__ ?? 'sqlite:sims-clone.db';
  const db = await Database.load(dbUrl);
  const runId = window.__SIMS_RUN_ID__ ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new SQLiteAdapter({ db, runId }).connect();
}

function showFatalBootError(err) {
  console.error('[TauriBootstrap] Failed to initialise SQLite persistence', err);
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'inset:16px',
    'z-index:99999',
    'background:rgba(18,14,14,0.96)',
    'color:#f4d7d7',
    'border:1px solid rgba(255,120,120,0.35)',
    'border-radius:12px',
    'padding:18px 20px',
    'font-family:system-ui,sans-serif',
    'overflow:auto',
  ].join(';');
  el.innerHTML = `
    <h2 style="margin:0 0 8px;color:#ffb4b4">SQLite bootstrap failed</h2>
    <p style="margin:0 0 12px;color:#d9b7b7">The desktop build could not initialise the SQLite persistence adapter.</p>
    <pre style="white-space:pre-wrap;color:#fff;background:rgba(255,255,255,0.06);padding:12px;border-radius:8px">${String(err?.stack ?? err?.message ?? err).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>
  `;
  document.body.appendChild(el);
}

try {
  window.__SIMS_PERSISTENCE_ADAPTER__ = await createPersistenceAdapter();
  const { Game } = await import('./core/Game.js');
  const container = document.getElementById('canvas-container');
  window._game = new Game(container, {
    persistenceAdapter: window.__SIMS_PERSISTENCE_ADAPTER__,
  });
} catch (err) {
  showFatalBootError(err);
}
