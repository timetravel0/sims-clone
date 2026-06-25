// Desktop launcher: WebKit (Safari/Tauri) can't do WebGL on every Mac, so we run
// the Vite dev server and open it in a chromeless Chrome --app window instead.
// A dedicated profile dir keeps localStorage saves persistent across launches.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL = 'http://127.0.0.1:1420/';
const PERSISTENCE_PORT = 1421;
const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-app');
const DATA_DIR = path.join(ROOT, '.data');
const SQLITE_FILE = path.join(DATA_DIR, 'sims-clone.sqlite');
const LOGS_DIR = path.join(ROOT, 'logs');   // per-game session logs (analysable on the fly)
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
].find(existsSync);

if (!CHROME) {
  console.error('Google Chrome non trovato in /Applications. Installalo o avvia "npm run dev" e apri', URL);
  process.exit(1);
}

const vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit' });
const persistenceServer = await startPersistenceServer();

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(URL)).ok) return true; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

let chrome;
function shutdown() {
  chrome?.kill();
  persistenceServer?.close();
  vite.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!(await waitForServer())) {
  console.error('Il server Vite non ha risposto entro 30s.');
  shutdown();
}

chrome = spawn(CHROME, [
  `--app=${URL}`,
  `--user-data-dir=${PROFILE}`,
  '--window-size=1280,820',
  '--no-first-run',
  '--no-default-browser-check',
], { stdio: 'ignore' });

// Closing the app window ends Chrome → tear down Vite too.
chrome.on('exit', shutdown);

async function startPersistenceServer() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(LOGS_DIR, { recursive: true });
  // Fresh launch ⇒ wipe stale per-game logs so logs/ only ever holds the game being
  // played now (mirrors the SessionLogger clearing localStorage on a new launch).
  try {
    const stale = (await readdir(LOGS_DIR)).filter(f => /^sims-log-.*\.json$/.test(f));
    await Promise.all(stale.map(f => rm(path.join(LOGS_DIR, f), { force: true })));
  } catch { /* best-effort cleanup */ }
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:1420');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: SQLITE_FILE }));
        return;
      }
      if (req.method === 'GET' && req.url === '/info') {
        let bytes = 0;
        try { bytes = (await stat(SQLITE_FILE)).size; } catch { /* no file yet */ }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ path: SQLITE_FILE, bytes }));
        return;
      }
      if (req.method === 'GET' && req.url === '/db') {
        if (!existsSync(SQLITE_FILE)) { res.writeHead(204); res.end(); return; }
        const bytes = await readFile(SQLITE_FILE);
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(bytes);
        return;
      }
      if (req.method === 'POST' && req.url === '/db') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 256 * 1024 * 1024) throw new Error('SQLite payload too large');
          chunks.push(chunk);
        }
        const tmp = `${SQLITE_FILE}.tmp`;
        await writeFile(tmp, Buffer.concat(chunks));
        await rename(tmp, SQLITE_FILE);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: SQLITE_FILE, bytes: size }));
        return;
      }
      if (req.method === 'POST' && req.url === '/log') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) throw new Error('Log payload too large');
          chunks.push(chunk);
        }
        const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        // One file per game, keyed by session start (safe filename), rewritten live.
        const stamp = String(json.startedAt ?? json.session ?? Date.now()).replace(/[^0-9A-Za-z._-]/g, '-');
        const file = path.join(LOGS_DIR, `sims-log-${stamp}.json`);
        const tmp = `${file}.tmp`;
        await writeFile(tmp, JSON.stringify(json));
        await rename(tmp, file);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: file, events: json.events?.length ?? 0 }));
        return;
      }
      res.writeHead(404); res.end('not found');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PERSISTENCE_PORT, '127.0.0.1', resolve);
  });
  console.log(`SQLite filesystem persistence: ${SQLITE_FILE}`);
  return server;
}
