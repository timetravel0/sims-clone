/**
 * PersistenceAdapter — storage abstraction for SaveLoad and the experiment log.
 *
 * SaveLoad no longer talks to localStorage directly; it goes through an adapter.
 * This makes it possible to swap storage backends (SqlJsAdapter — SQLite WASM on
 * OPFS — or LocalStorageAdapter) without touching the simulation or SaveLoad
 * logic. See docs/PERSISTENCE.md.
 *
 * Contract (all methods are async / await-compatible):
 *   saveSlot(slot, data)          → store a full save blob for a slot
 *   readSlot(slot)                → the stored blob, or null
 *   hasSlot(slot)                 → boolean
 *   deleteSlot(slot)              → void
 *   listSlots()                   → [{ slot, data|null }]
 *   appendEvent(runId, event)     → append one event to a run's event log
 *   saveSnapshot(runId, state)    → store a state snapshot, returns snapshotId
 *   loadSnapshot(runId, id)       → the snapshot, or null
 *
 * The LocalStorageAdapter implements these synchronously (values are returned
 * directly, which is still `await`-compatible) so the existing synchronous
 * boot/UI call sites keep working. A future async adapter (SQLite) would
 * require those call sites to await — documented in docs/PERSISTENCE.md.
 */
export class PersistenceAdapter {
  async saveSlot(_slot, _data)        { throw new Error('PersistenceAdapter.saveSlot not implemented'); }
  async readSlot(_slot)               { throw new Error('PersistenceAdapter.readSlot not implemented'); }
  async hasSlot(_slot)                { throw new Error('PersistenceAdapter.hasSlot not implemented'); }
  async deleteSlot(_slot)             { throw new Error('PersistenceAdapter.deleteSlot not implemented'); }
  async listSlots()                   { throw new Error('PersistenceAdapter.listSlots not implemented'); }
  async appendEvent(_runId, _event)   { throw new Error('PersistenceAdapter.appendEvent not implemented'); }
  async saveSnapshot(_runId, _state)  { throw new Error('PersistenceAdapter.saveSnapshot not implemented'); }
  async loadSnapshot(_runId, _id)     { throw new Error('PersistenceAdapter.loadSnapshot not implemented'); }
}
