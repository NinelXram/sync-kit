import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../kit/scripts/lib/config.mjs';
import { parseDiscussion, strictIssues } from '../kit/scripts/lib/discussion.mjs';

const cfg = (strict = {}) => validateConfig({
  kitVersion: '1.0.0', sides: { be: 'BE', fe: 'FE', qa: 'QA' }, strict: { since: '2026-01-01', ...strict },
}).config;
const note = (entries, targets = { fe: 'acked' }, created = '2026-03-01', heading = '## Discussion') => ({
  meta: { created, targets }, body: `intro\n\n${heading}\n\n${entries}\n`,
});

test('parses entries with em dash, en dash, hyphen', () => {
  const es = parseDiscussion(note('### [FE] 2026-03-02 @alice — acked\nok\n### [FE] 2026-03-03 @alice – applied\nx\n### [QA] 2026-03-04 @bob - verified\ny').body);
  assert.deepEqual(es.map((e) => [e.label, e.date, e.handle, e.status]),
    [['FE', '2026-03-02', '@alice', 'acked'], ['FE', '2026-03-03', '@alice', 'applied'], ['QA', '2026-03-04', '@bob', 'verified']]);
  assert.equal(es[0].text, 'ok');
});

test('status is first word: "applied (XYZ-FE-003)"', () => {
  const [e] = parseDiscussion(note('### [FE] 2026-03-02 @alice — Applied (XYZ-FE-003)\ndone').body);
  assert.equal(e.status, 'applied');
  assert.equal(e.rest, '(XYZ-FE-003)');
});

test('ignores example entries inside html comment', () => {
  const body = '## Discussion\n\n<!--\n### [FE] 2026-03-02 @alice — acked\n-->\n';
  assert.deepEqual(parseDiscussion(body), []);
});

test('accepts Thảo luận heading and ignores other sections', () => {
  const es = parseDiscussion('## Other\n### [FE] 2026-03-02 @alice — acked\n\n## Thảo luận\n### [FE] 2026-03-02 @alice — acked\n');
  assert.equal(es.length, 1);
});

test('errors when fe acked but no FE entry', () => {
  assert.equal(strictIssues(note('### [BE] 2026-03-02 @bob — raised\nhi'), cfg()).errors.length, 1);
});

test('errors when last FE entry is acked but status applied', () => {
  assert.equal(strictIssues(note('### [FE] 2026-03-02 @alice — acked\nok', { fe: 'applied' }), cfg()).errors.length, 1);
});

test('QA verified after FE applied does not affect FE check', () => {
  const r = strictIssues(note('### [FE] 2026-03-02 @alice — applied (XYZ-FE-003)\nx\n### [FE] 2026-03-03 @alice — note\nfollow up\n### [QA] 2026-03-04 @bob — verified\nok', { fe: 'applied' }), cfg());
  assert.deepEqual(r, { errors: [], warnings: [] });
});

test('raised entry from QA is not a warning', () => {
  const r = strictIssues(note('### [QA] 2026-03-02 @bob — raised\nx\n### [FE] 2026-03-02 @alice — acked\nok'), cfg());
  assert.deepEqual(r.warnings, []);
});

test('applied ref handling', () => {
  const applied = (s) => strictIssues(note(`### [FE] 2026-03-02 @alice — applied ${s}\n${s ? '' : 'done'}`, { fe: 'applied' }), cfg()).errors.length;
  assert.equal(applied(''), 1);
  assert.equal(applied('PR-52'), 0);
  assert.equal(applied('abc1234'), 0);
  assert.equal(applied('ABC-FE-010'), 0);
  assert.equal(applied('(XYZ-FE-003)'), 0);
  assert.equal(applied('— merged in !42'), 0);
  assert.equal(applied('(!7)'), 0);
  assert.equal(applied('wow!42'), 1);
  assert.equal(strictIssues(note('### [FE] 2026-03-02 @alice — applied\nsee https://example.com/pr/5', { fe: 'applied' }), cfg()).errors.length, 0);
});

test('errors n/a without reason, ok with reason; disputed too', () => {
  assert.equal(strictIssues(note('### [FE] 2026-03-02 @alice — n/a\n', { fe: 'n/a' }), cfg()).errors.length, 1);
  assert.equal(strictIssues(note('### [FE] 2026-03-02 @alice — n/a\nnot used on web', { fe: 'n/a' }), cfg()).errors.length, 0);
  assert.equal(strictIssues(note('### [FE] 2026-03-02 @alice — disputed\n', { fe: 'disputed' }), cfg()).errors.length, 1);
});

test('skips notes created before strict.since', () => {
  assert.deepEqual(strictIssues(note('', { fe: 'applied' }, '2025-12-31'), cfg()), { errors: [], warnings: [] });
});

test('skips when strict disabled', () => {
  assert.deepEqual(strictIssues(note('', { fe: 'applied' }), cfg({ enabled: false })), { errors: [], warnings: [] });
});

test('unknown entry status "done" or "đang áp dụng" → warning, no error', () => {
  const r = strictIssues(note('### [FE] 2026-03-02 @alice — acked\nok\n### [FE] 2026-03-03 @alice — done\nx\n### [FE] 2026-03-04 @alice — đang áp dụng\ny'), cfg());
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 2);
});

test('label matches side id or label case-insensitively', () => {
  assert.equal(strictIssues(note('### [fe] 2026-03-02 @alice — acked\nok'), cfg()).errors.length, 0);
});
