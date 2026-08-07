import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
const pnpmArguments = process.argv.slice(2);

if (pnpmArguments.length === 0) {
  console.error('Usage: node infra/scripts/run-with-env.mjs <pnpm arguments>');
  process.exit(2);
}

if (existsSync(envFile)) {
  loadEnvFile(envFile);
} else if (process.env.DATABASE_URL === undefined) {
  console.error('Missing .env and DATABASE_URL. Create .env with: cp .env.example .env');
  process.exit(2);
}

const child = spawn('pnpm', pnpmArguments, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

const forwardSignal = (signal) => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
};

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

child.once('error', (error) => {
  console.error(`Unable to start pnpm: ${error.message}`);
  process.exitCode = 1;
});

child.once('close', (code, signal) => {
  if (code !== null) {
    process.exitCode = code;
    return;
  }
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
});
