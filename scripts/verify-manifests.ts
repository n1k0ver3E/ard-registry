import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, runConformance } from './conformance.js';

const catalogsDir = resolve(REPO_ROOT, 'catalogs');
const files = readdirSync(catalogsDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('No catalog manifests found in catalogs/.');
  process.exit(1);
}

let allOk = true;
for (const file of files) {
  const path = resolve(catalogsDir, file);
  const { ok, stdout } = runConformance('manifest', path);
  process.stdout.write(stdout);
  if (!ok) allOk = false;
}

console.log('\n' + '='.repeat(60));
console.log(
  allOk
    ? `✅ ALL ${files.length} MANIFESTS CONFORMANT`
    : '❌ ONE OR MORE MANIFESTS FAILED CONFORMANCE',
);
process.exit(allOk ? 0 : 1);
