import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, sha256File, annotate, localDate } from '../kit/scripts/lib/io.mjs';

test('parseArgs repeats --file into array', () => {
  assert.deepEqual(parseArgs(['--file', 'a', '--file', 'b', '--x', 'y']), { file: ['a', 'b'], x: 'y' });
});
test('parseArgs flag without value is true', () => {
  assert.deepEqual(parseArgs(['--json', '--a', '1']), { json: true, a: '1' });
});
test('localDate uses local calendar day', () => {
  const code = "const {localDate}=await import(process.argv[1]);const d=new Date('2026-10-27T23:00:00Z');console.log(localDate(d)+' '+d.toISOString().slice(0,10))";
  const url = new URL('../kit/scripts/lib/io.mjs', import.meta.url).href;
  const run = (TZ) => spawnSync(process.execPath, ['--input-type=module', '-e', code, url], { env: { ...process.env, TZ }, encoding: 'utf8' }).stdout.trim();
  assert.equal(run('Asia/Ho_Chi_Minh'), '2026-10-28 2026-10-27');
  assert.equal(run('UTC'), '2026-10-27 2026-10-27');
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
test('sha256File equal for LF and CRLF copies', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'io-'));
  writeFileSync(path.join(d, 'a'), 'x\ny\n');
  writeFileSync(path.join(d, 'b'), '\uFEFFx\r\ny\r\n');
  assert.equal(sha256File(path.join(d, 'a')), sha256File(path.join(d, 'b')));
});
test('annotate github', () => {
  assert.equal(annotate('error', 'sync/a.md', 'bad', { GITHUB_ACTIONS: 'true' }), '::error file=sync/a.md::bad');
});
test('annotate gitlab and local', () => {
  assert.equal(annotate('error', 'sync/a.md', 'bad', { GITLAB_CI: 'true' }), 'error: sync/a.md: bad');
  assert.equal(annotate('error', 'sync/a.md', 'bad', {}), 'error: sync/a.md: bad');
  assert.equal(annotate('error', null, 'bad', {}), 'error: bad');
});
