// Runs the browser tests one after another and prints a summary.
//   npm run test:e2e                 all suites
//   npm run test:e2e -- training     just the suites whose name contains "training"
// Starts the app on port 5211 unless E2E_URL points at one already running.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = fileURLToPath(new URL('..', import.meta.url));
const filters = process.argv.slice(2);
const suites = readdirSync(here)
  .filter((f) => f.endsWith('.e2e.mjs'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
  .sort();

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: appDir, stdio: 'inherit', ...opts });
    child.on('exit', (code) => resolve(code ?? 1));
  });

let server;
// Never leave the app running behind us, even when interrupted (Ctrl-C, kill).
const stopServer = () => {
  if (server) {
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
    server = undefined;
  }
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stopServer(), process.exit(130)));
if (!process.env.E2E_URL) {
  server = spawn('npx', ['vite', '--port', '5211', '--strictPort'], { cwd: appDir, stdio: 'ignore', detached: true });
  server.on('exit', (code) => {
    if (code) console.error(`The app's dev server stopped (exit ${code}) — is port 5211 already in use?`);
  });
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch('http://localhost:5211/')).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      console.error('The app did not start on port 5211.');
      stopServer();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const results = [];
for (const suite of suites) {
  console.log(`\n━━━ ${suite} ━━━`);
  const started = Date.now();
  const code = await run('npx', ['vite-node', `e2e/${suite}`]);
  results.push({ suite, ok: code === 0, secs: Math.round((Date.now() - started) / 1000) });
}
stopServer();

console.log('\n━━━ Summary ━━━');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.suite}  (${r.secs}s)`);
console.log(`Screenshots: ${here}output/`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
