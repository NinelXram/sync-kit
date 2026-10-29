import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, verifyManifest, buildManifest } from '../kit/scripts/lib/install.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'kit', 'scripts');

async function tmp() { return mkdtemp(path.join(tmpdir(), 'sync-kit-inst-')); }

test('copies files and verifyManifest is empty', async () => {
  const d = await tmp();
  try {
    const syncDir = path.join(d, 'sync');
    const { copied } = install({ kitScriptsDir: KIT, syncDir });
    const manifest = JSON.parse(readFileSync(path.join(KIT, 'MANIFEST.json'), 'utf8'));
    assert.deepEqual([...copied].sort(), [...Object.keys(manifest), 'MANIFEST.json'].sort());
    assert.ok(existsSync(path.join(syncDir, 'scripts', 'sync.mjs')));
    assert.deepEqual(verifyManifest(path.join(syncDir, 'scripts')), []);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('refuses when source file hash mismatches', async () => {
  const d = await tmp();
  try {
    const src = path.join(d, 'kit', 'scripts');
    await cp(KIT, src, { recursive: true });
    const f = path.join(src, 'lib', 'notes.mjs');
    await writeFile(f, (await readFile(f, 'utf8')) + '// edited\n');
    assert.deepEqual(verifyManifest(src), ['modified: lib/notes.mjs']);
    assert.throws(() => install({ kitScriptsDir: src, syncDir: path.join(d, 'sync') }), /lib\/notes\.mjs/);
    assert.equal(existsSync(path.join(d, 'sync', 'scripts')), false);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('removes stale file not in manifest', async () => {
  const d = await tmp();
  try {
    const syncDir = path.join(d, 'sync');
    install({ kitScriptsDir: KIT, syncDir });
    const scripts = path.join(syncDir, 'scripts');
    await writeFile(path.join(scripts, 'old.mjs'), 'x\n');
    await mkdir(path.join(scripts, 'lib', 'legacy'), { recursive: true });
    await writeFile(path.join(scripts, 'lib', 'legacy', 'gone.mjs'), 'x\n');
    await writeFile(path.join(d, 'outside.txt'), 'keep\n');
    await writeFile(path.join(syncDir, 'sibling.md'), 'keep\n');
    assert.deepEqual(verifyManifest(scripts).sort(), ['extra: lib/legacy/gone.mjs', 'extra: old.mjs']);
    const { removed } = install({ kitScriptsDir: KIT, syncDir });
    assert.deepEqual([...removed].sort(), ['lib/legacy/gone.mjs', 'old.mjs']);
    assert.equal(existsSync(path.join(scripts, 'old.mjs')), false);
    assert.equal(existsSync(path.join(scripts, 'lib', 'legacy')), false);
    assert.ok(existsSync(path.join(d, 'outside.txt')));
    assert.ok(existsSync(path.join(syncDir, 'sibling.md')));
    assert.deepEqual(verifyManifest(scripts), []);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('refuses to install onto itself', async () => {
  const d = await tmp();
  try {
    const syncDir = path.join(d, 'sync');
    install({ kitScriptsDir: KIT, syncDir });
    const scripts = path.join(syncDir, 'scripts');
    assert.throws(() => install({ kitScriptsDir: scripts, syncDir }), /itself/);
    const r = spawnSync(process.execPath, ['sync/scripts/sync.mjs', 'install', '--sync-dir', 'sync'], { cwd: d, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /itself/);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('install command copies from kit path into --sync-dir', async () => {
  const d = await tmp();
  try {
    const r = spawnSync(process.execPath, [path.join(KIT, 'sync.mjs'), 'install', '--sync-dir', 'sync'], { cwd: d, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(verifyManifest(path.join(d, 'sync', 'scripts')), []);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('MANIFEST.json is up to date', () => {
  const onDisk = JSON.parse(readFileSync(path.join(KIT, 'MANIFEST.json'), 'utf8'));
  assert.deepEqual(onDisk, buildManifest(KIT), 'run `node scripts/build-manifest.mjs`');
  assert.deepEqual(Object.keys(onDisk), Object.keys(onDisk).sort());
});
