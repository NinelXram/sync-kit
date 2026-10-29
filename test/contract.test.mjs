import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { contractCheck } from '../kit/scripts/lib/contract.mjs';
import { makeTempRepo, gitCommit } from './helpers.mjs';

const config = {
  modules: { billing: 'billing', orders: 'orders', shipping: 'shipping' },
  contract: { globs: { be: ['backend/**/*.dto.ts'], fe: ['*.proto'] } },
};

test('notes in every configured module are recognised', () => {
  for (const m of Object.values(config.modules)) {
    const r = contractCheck({ changed: ['backend/a.dto.ts', `sync/${m}/2026-01-01-be-x.md`], config });
    assert.deepEqual(r.noteFiles, [`sync/${m}/2026-01-01-be-x.md`]);
    assert.equal(r.warn, false);
  }
});
test('README/_TEMPLATE and unknown dirs are not notes', () => {
  const r = contractCheck({ changed: ['sync/README.md', 'sync/billing/_TEMPLATE.md', 'sync/other/x.md', 'sync/billing/x.txt'], config });
  assert.deepEqual(r.noteFiles, []);
});
test('warn false when no contract files', () => {
  assert.equal(contractCheck({ changed: ['src/a.ts'], config }).warn, false);
});
test('warn true when contract changed without note', () => {
  const r = contractCheck({ changed: ['backend/a.dto.ts', 'x.proto'], config });
  assert.equal(r.warn, true);
  assert.deepEqual(r.contractFiles, ['backend/a.dto.ts', 'x.proto']);
});
test('flat layout uses notes/ and custom syncPrefix', () => {
  const r = contractCheck({ changed: ['x.proto', 'docs/sync/notes/a.md'], config: { modules: {}, contract: config.contract }, syncPrefix: 'docs/sync' });
  assert.equal(r.warn, false);
});

const cfg = JSON.stringify({
  kitVersion: '1.0.0', lang: 'en', topology: 'monorepo', sides: { be: 'BE', fe: 'FE' },
  modules: { billing: 'billing' }, strict: { enabled: true, since: '2020-01-01' }, contract: { globs: { be: ['backend/**/*.dto.ts'] } },
});

test('CLI --base HEAD~1 on single-commit repo exits 0 with skipped', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfg, 'backend/a.dto.ts': 'x' });
  try {
    gitCommit(r.root, 'one');
    const out = r.run(['contract-check', '--base', 'HEAD~1']);
    assert.equal(out.code, 0);
    assert.match(out.stdout, /skipped: cannot resolve HEAD~1/);
  } finally { await r.cleanup(); }
});

test('CLI warns (exit 0) and --strict exits 1; note silences', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfg, 'a.txt': 'x' });
  try {
    gitCommit(r.root, 'one');
    mkdirSync(path.join(r.root, 'backend'), { recursive: true });
    writeFileSync(path.join(r.root, 'backend/a.dto.ts'), 'y');
    gitCommit(r.root, 'two');
    let out = r.run(['contract-check', '--base', 'HEAD~1']);
    assert.equal(out.code, 0);
    assert.match(out.stdout, /warning/);
    assert.match(out.stdout, /backend\/a\.dto\.ts/);
    assert.equal(r.run(['contract-check', '--base', 'HEAD~1', '--strict']).code, 1);
    mkdirSync(path.join(r.root, 'sync/billing'), { recursive: true });
    writeFileSync(path.join(r.root, 'sync/billing/2026-01-01-be-x.md'), '# n');
    writeFileSync(path.join(r.root, 'backend/a.dto.ts'), 'z');
    gitCommit(r.root, 'three');
    out = r.run(['contract-check', '--base', 'HEAD~1', '--strict']);
    assert.equal(out.code, 0);
    assert.match(out.stdout, /OK/);
  } finally { await r.cleanup(); }
});

test('CLI --base "" (empty CI variable) exits 0 with skipped; missing --base still exits 2', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfg, 'backend/a.dto.ts': 'x' });
  try {
    gitCommit(r.root, 'one');
    const out = r.run(['contract-check', '--base', '']);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /skipped/);
    assert.equal(r.run(['contract-check']).code, 2);
  } finally { await r.cleanup(); }
});
