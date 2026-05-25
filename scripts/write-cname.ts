import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { siteHost } from '../src/lib/site-host';

const HERE = dirname(fileURLToPath(import.meta.url));
const CNAME_PATH = resolve(HERE, '../public/CNAME');

try {
  const host = siteHost();
  await writeFile(CNAME_PATH, host + '\n');
  console.log(`write-cname: wrote ${CNAME_PATH} = ${host}`);
} catch (err) {
  console.error(`write-cname: ${(err as Error).message}`);
  process.exit(1);
}
