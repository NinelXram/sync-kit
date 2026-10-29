import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lintPrompt } from '../scripts/lint-prompts.mjs';

const H = ['Goal', 'Preconditions', 'Inputs', 'Steps', 'Hard rules', 'Outputs', 'Verify', 'Handoff'];
function make({ id = '01-install', headings = H, verify = 'Run `node .sync-kit/kit/scripts/sync.mjs doctor --phase 01`.', extra = '' } = {}) {
  const body = headings.map((h) => `## ${h}\n\n${h === 'Verify' ? verify : 'text'}\n`).join('\n');
  return `<!-- sync-kit prompt: ${id} v1 -->\n# Title\n\n${body}\n${extra}\n`;
}

test('valid prompt has no errors', () => {
  assert.deepEqual(lintPrompt(make(), 'prompts/01-install.md'), []);
});
test('missing Verify heading', () => {
  const errs = lintPrompt(make({ headings: H.filter((h) => h !== 'Verify') }), 'prompts/01-install.md');
  assert.ok(errs.some((e) => /Verify/.test(e)));
});
test('wrong heading order', () => {
  const h = [...H];
  [h[3], h[4]] = [h[4], h[3]];
  assert.ok(lintPrompt(make({ headings: h }), 'prompts/01-install.md').length > 0);
});
test('Verify must contain sync.mjs doctor', () => {
  assert.ok(lintPrompt(make({ verify: 'looks fine' }), 'prompts/01-install.md').length > 0);
});
test('bad header / id mismatch', () => {
  assert.ok(lintPrompt(make({ id: '02-agent-rules' }), 'prompts/01-install.md').length > 0);
  assert.ok(lintPrompt('# no header\n', 'prompts/01-install.md').length > 0);
});
test('rejects @main and /main/', () => {
  assert.ok(lintPrompt(make({ extra: 'uses repo@main' }), 'prompts/01-install.md').length > 0);
  assert.ok(lintPrompt(make({ extra: 'https://x.example/raw/main/a.md' }), 'prompts/01-install.md').length > 0);
});
test('rejects cp of kit/scripts', () => {
  assert.ok(lintPrompt(make({ extra: 'cp -r .sync-kit/kit/scripts sync/scripts' }), 'prompts/01-install.md').length > 0);
  assert.ok(lintPrompt(make({ extra: 'Copy-Item .sync-kit/kit/scripts x' }), 'prompts/01-install.md').length > 0);
});
test('rejects KIT variables', () => {
  assert.ok(lintPrompt(make({ extra: 'node "$KIT/kit/scripts/sync.mjs"' }), 'prompts/01-install.md').length > 0);
  assert.ok(lintPrompt(make({ extra: '%KIT%' }), 'prompts/01-install.md').length > 0);
  assert.ok(lintPrompt(make({ extra: '$env:KIT' }), 'prompts/01-install.md').length > 0);
});
test('CLI exits 0 on repo prompts', () => {
  const r = spawnSync(process.execPath, ['scripts/lint-prompts.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
