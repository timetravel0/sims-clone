import { Logger } from '../utils/Logger.js';

const DB_NAME  = 'sims-clone';
const DB_VER   = 1;
const STORE    = 'saves';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'slot' });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export class SaveLoad {
  constructor(game) {
    this._game = game;
  }

  async save(slot = 1) {
    try {
      const db   = await openDB();
      const data = { slot, ts: Date.now(), state: this._game.serialise() };
      const tx   = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data);
      await new Promise(r => { tx.oncomplete = r; });
      Logger.info(`[Save] Slot ${slot} saved`);
      return true;
    } catch (err) {
      Logger.error(`[Save] ${err.message}`);
      return false;
    }
  }

  async load(slot = 1) {
    try {
      const db  = await openDB();
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      const row = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = rej; });
      if (!row) { Logger.warn(`[Load] No save in slot ${slot}`); return false; }
      this._game.restore(row.state);
      Logger.info(`[Load] Slot ${slot} restored (saved ${new Date(row.ts).toLocaleTimeString()})`);
      return true;
    } catch (err) {
      Logger.error(`[Load] ${err.message}`);
      return false;
    }
  }

  async listSlots() {
    const db  = await openDB();
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    return new Promise(res => { req.onsuccess = () => res(req.result); });
  }
}
