// Runs every layout harness in this directory against a live server and exits
// non-zero if any of them fails. These are not vitest tests: they need a served
// page, so vitest.config.ts's test/**/*.test.ts pattern deliberately excludes
// them and they run only via `npm run test:visual`
//
// Point them at a different origin with SITE_URL, e.g. to check a production
// build:  npm run preview & SITE_URL=http://localhost:4322 npm run test:visual
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';

const harnesses = readdirSync(HERE)
  .filter(f => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort();

if (harnesses.length === 0) {
  console.error('run-all: no verify-*.mjs harnesses found');
  process.exit(1);
}

console.log(`run-all: ${harnesses.length} harness(es) against ${SITE_URL}\n`);

const failed = [];
for (const harness of harnesses) {
  console.log(`--- ${harness} ---`);
  const result = spawnSync(process.execPath, [resolve(HERE, harness)], {
    stdio: 'inherit',
    env: { ...process.env, SITE_URL },
  });
  if (result.status !== 0) failed.push(harness);
  console.log('');
}

if (failed.length > 0) {
  console.error(`run-all: FAILED -- ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`run-all: all ${harnesses.length} harness(es) passed`);
