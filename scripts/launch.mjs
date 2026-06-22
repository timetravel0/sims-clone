// Desktop launcher: WebKit (Safari/Tauri) can't do WebGL on every Mac, so we run
// the Vite dev server and open it in a chromeless Chrome --app window instead.
// A dedicated profile dir keeps localStorage saves persistent across launches.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const URL = 'http://127.0.0.1:1420/';
const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-app');
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
].find(existsSync);

if (!CHROME) {
  console.error('Google Chrome non trovato in /Applications. Installalo o avvia "npm run dev" e apri', URL);
  process.exit(1);
}

const vite = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit' });

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
