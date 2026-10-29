import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'test');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => path.join('test', f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
