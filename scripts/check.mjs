import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(mjs|js)$/.test(p)) {
      const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr);
      count++;
    }
  }
}
walk(root);
const validate = spawnSync(process.execPath, [path.join(root, 'scripts/validate-repository.mjs')], { encoding: 'utf8' });
if (validate.status !== 0) throw new Error(validate.stdout + validate.stderr);
console.log(`${count} file JavaScript validi. ${validate.stdout.trim()}`);
