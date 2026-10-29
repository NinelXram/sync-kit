import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeTempRepo, gitCommit } from './helpers.mjs';

test('node version >= 18', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 18);
});

test('makeTempRepo can commit without global git identity', async () => {
  const repo = await makeTempRepo({});
  try {
    await writeFile(path.join(repo.root, 'a.txt'), 'hello\n');
    const r = gitCommit(repo.root, 'init');
    assert.equal(r.status, 0, r.stderr);
  } finally {
    await repo.cleanup();
  }
});
