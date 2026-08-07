import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function collectSpecs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSpecs(path)));
    } else if (entry.isFile() && entry.name.endsWith('.spec.js')) {
      files.push(path);
    }
  }

  return files;
}

const specs = (await collectSpecs('dist')).sort();
if (specs.length === 0) {
  throw new Error('No compiled test files were found in dist.');
}

const result = spawnSync(process.execPath, ['--test', ...specs], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
