import { spawn } from 'node:child_process';

const mode = process.env.SERVICE_MODE;
const run = (file, wait = false) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env });
  child.on('error', reject);
  child.on('exit', (code, signal) => code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' ? resolve() : reject(new Error(`${file} exited with ${code ?? signal}`)));
  if (!wait) {
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  }
});

if (mode === 'web') {
  await run('api-dist/server/static.js');
} else if (mode === 'api') {
  await run('api-dist/server/db/migrate.js', true);
  const canResetAdmin = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12);
  if (process.env.RUN_SEED_ON_START === 'true' && !canResetAdmin) console.warn('Skipping administrator seed: ADMIN_EMAIL and a password of at least 12 characters are required.');
  if (canResetAdmin) await run('api-dist/server/db/seed.js', true);
  await run('api-dist/server/index.js');
} else if (mode === 'worker') {
  await run('api-dist/worker/index.js');
} else {
  throw new Error('SERVICE_MODE must be web, api, or worker');
}
