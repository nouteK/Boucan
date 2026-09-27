// Starts the game server (tsx watch, :3001) and the client (Vite, :5180) together.
// Ctrl+C stops both. Open http://localhost:5180
// Port 3001 taken? PORT=3002 BOUCAN_SERVER_PORT=3002 npm run dev (the Vite proxy follows).
import { spawn } from 'node:child_process';

const procs = [
  ['server', 'npm run dev -w @boucan/server'],
  ['client', 'npm run dev -w @boucan/client'],
].map(([name, command]) => {
  // One command string: npm is a .cmd shim on Windows, so it needs a shell.
  const p = spawn(command, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  const tag = name === 'server' ? '\x1b[35m[server]\x1b[0m' : '\x1b[36m[client]\x1b[0m';
  for (const stream of [p.stdout, p.stderr]) {
    stream.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => `${tag} ${l}\n`).join('')));
  }
  p.on('exit', (code) => {
    console.log(`${tag} exited (${code})`);
    procs.forEach((q) => q.kill());
    process.exit(code ?? 0);
  });
  return p;
});
process.on('SIGINT', () => procs.forEach((p) => p.kill()));
