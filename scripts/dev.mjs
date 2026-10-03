import { spawn } from 'node:child_process';

const processes = [
  spawn('uv', ['run', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'], {
    stdio: 'inherit', env: { ...process.env, UV_CACHE_DIR: '.cache/uv' },
  }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
