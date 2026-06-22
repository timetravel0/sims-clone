import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { HeadlessSimulation } from '../src/headless/HeadlessSimulation.js';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k, v = true] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));

const runs = Number(args.runs ?? 3);
const ticks = Number(args.ticks ?? 2000);
const seed = Number(args.seed ?? 1);
const outDir = path.resolve(args.out ?? 'headless-runs');
const dbPath = path.join(outDir, 'sims-headless.sqlite');

fs.mkdirSync(outDir, { recursive: true });

const SQL = await initSqlJs();
const db = fs.existsSync(dbPath)
  ? new SQL.Database(fs.readFileSync(dbPath))
  : new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    seed INTEGER,
    ticks INTEGER,
    started_at TEXT,
    summary_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    tick INTEGER,
    event_type TEXT,
    actor_id TEXT,
    target_id TEXT,
    interaction_type TEXT,
    accepted INTEGER,
    event_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS relationship_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    tick INTEGER,
    from_id TEXT,
    to_id TEXT,
    affinity REAL,
    dims_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_headless_event_run_tick ON event_log(run_id, tick);
  CREATE INDEX IF NOT EXISTS idx_headless_rel_run_tick ON relationship_snapshots(run_id, tick);
`);

const summaries = [];
for (let i = 0; i < runs; i++) {
  const runSeed = seed + i;
  const runId = `headless_${Date.now()}_${runSeed}`;
  const sim = new HeadlessSimulation({ seed: runSeed });
  const summary = sim.run({ ticks });
  summaries.push({ runId, ...summary });

  db.run('INSERT INTO runs (id, seed, ticks, started_at, summary_json) VALUES (?,?,?,?,?)',
    [runId, runSeed, ticks, new Date().toISOString(), JSON.stringify(summary)]);

  db.run('BEGIN');
  try {
    for (const e of sim.events) {
      db.run(`INSERT INTO event_log
        (run_id, tick, event_type, actor_id, target_id, interaction_type, accepted, event_json)
        VALUES (?,?,?,?,?,?,?,?)`,
        [runId, e.tick, e.type, e.actorId ?? e.visitorId ?? null, e.targetId ?? e.hostId ?? null,
          e.interactionType ?? null, e.accepted == null ? null : (e.accepted ? 1 : 0), JSON.stringify(e)]);
    }
    for (const snap of sim.relationshipSnapshots) {
      for (const row of snap.rows) {
        db.run(`INSERT INTO relationship_snapshots (run_id, tick, from_id, to_id, affinity, dims_json)
          VALUES (?,?,?,?,?,?)`,
          [runId, snap.tick, row.fromId, row.toId, row.affinity, JSON.stringify(row.dims)]);
      }
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

fs.writeFileSync(dbPath, Buffer.from(db.export()));
fs.writeFileSync(path.join(outDir, 'latest-summary.json'), JSON.stringify(summaries, null, 2));

console.table(summaries);
console.log(`Headless SQLite written to ${dbPath}`);
