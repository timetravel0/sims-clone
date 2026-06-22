/**
 * GameContext — singleton iniettabile che sostituisce tutti gli accessi diretti
 * a `globalThis.window?._game` nei moduli AI.
 *
 * Vantaggi:
 *  - Testabile in ambiente headless (basta chiamare GameContext.set(mockGame))
 *  - Nessun accoppiamento implicito con il DOM / window globale
 *  - Un unico punto di accesso al game state per tutta la logica AI
 *
 * Utilizzo:
 *   // All'avvio del gioco (main.js o Game.js):
 *   import { GameContext } from './core/GameContext.js';
 *   GameContext.set(gameInstance);
 *
 *   // Nei moduli AI:
 *   import { GameContext } from '../core/GameContext.js';
 *   const sims   = GameContext.get('sims')   ?? [];
 *   const clock  = GameContext.get('clock');
 *   const game   = GameContext.game;          // accesso diretto all'intero game
 */

let _game = null;

export const GameContext = {
  /** Registra l'istanza di gioco. Chiamato una sola volta da main.js. */
  set(game) {
    _game = game;
  },

  /** Restituisce l'intera istanza di gioco. */
  get game() {
    return _game;
  },

  /**
   * Accesso rapido a una proprietà di primo livello del game.
   * Restituisce undefined in modo sicuro se il game non è ancora inizializzato.
   * @param {string} key — es. 'sims', 'clock', 'socialDynamics', 'population'
   */
  get(key) {
    return _game?.[key];
  },

  /**
   * Restituisce la lista dei Sim, escludendo opzionalmente un ID specifico.
   * @param {string|null} excludeId
   */
  sims(excludeId = null) {
    const all = _game?.sims ?? [];
    return excludeId ? all.filter(s => s.id !== excludeId) : all;
  },

  /** Restituisce un Sim per ID. */
  simById(id) {
    return (_game?.sims ?? []).find(s => s.id === id) ?? null;
  },

  /** Ora del gioco (0–23). Default: 12 se il clock non è disponibile. */
  get hour() {
    return _game?.clock?.hour ?? 12;
  },

  /** Giorno corrente di gioco. */
  get day() {
    return _game?.clock?.day ?? 0;
  },

  /** Restituisce il sistema di relazioni sociali. */
  get socialDynamics() {
    return _game?.socialDynamics ?? null;
  },

  /** Restituisce il relationship graph. */
  get relationshipGraph() {
    return _game?.relationshipGraph ?? null;
  },

  /** Restituisce il sistema di popolazione. */
  get population() {
    return _game?.population ?? null;
  },

  /** Restituisce il memory system globale (cross-Sim). */
  get memorySystem() {
    return _game?.memorySystem ?? null;
  },

  /** True se il GameContext è stato inizializzato. */
  get ready() {
    return _game !== null;
  },

  /** Reset (utile per test). */
  reset() {
    _game = null;
  },
};
