import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../kit/scripts/lib/config.mjs';
import { listNoteFiles, loadNote, validateNote, isClosed, isOpenForActive, byUrgency } from '../kit/scripts/lib/notes.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cfg = (extra = {}) => validateConfig({
  kitVersion: '1.0.0', sides: { be: 'BE', fe: 'FE', qa: 'QA', mobile: 'Mobile' },
  modules: { billing: 'notes/billing', orders: 'notes/orders' },
  strict: { since: '2026-01-01' }, ...extra,
}).config;
const flatCfg = () => cfg({ modules: {} });

const ID = '2026-03-01-be-add-invoice';
const mk = (over = {}, { module = 'billing', file = ID, dir } = {}) => {
  const meta = { id: ID, title: 'Add invoice', module, from: 'be', type: 'feature', priority: 'normal', created: '2026-03-01', targets: { fe: 'pending', qa: 'pending' }, ...over };
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) =>
    typeof v === 'object' ? `${k}:\n${Object.entries(v).map(([a, b]) => `  ${a}: ${b}`).join('\n')}` : `${k}: ${v}`);
  const text = `---\n${lines.join('\n')}\n---\n\nbody\n`;
  const root = mkdtempSync(path.join(tmpdir(), 'sk-notes-'));
  const d = path.join(root, 'sync', dir ?? (module === 'general' ? 'notes' : `notes/${module}`));
  mkdirSync(d, { recursive: true });
  const abs = path.join(d, `${file}.md`);
  writeFileSync(abs, text);
  return loadNote(abs, root);
};

test('valid note has no errors', () => assert.deepEqual(validateNote(mk(), cfg()), []));
test('loadNote path is repo-relative with /', () => assert.equal(mk().path, `sync/notes/billing/${ID}.md`));

const bad = [
  ['id differs from file name', () => mk({}, { file: '2026-03-01-be-other' }), 'must match the file name'],
  ['unknown module', () => mk({ module: 'nope' }, { module: 'nope', dir: 'notes/billing' }), 'invalid `module`'],
  ['wrong directory', () => mk({}, { dir: 'notes/orders' }), 'wrong directory'],
  ['unknown from', () => mk({ from: 'zz', id: '2026-03-01-zz-add-invoice' }, { file: '2026-03-01-zz-add-invoice' }), 'invalid `from`'],
  ['unknown type', () => mk({ type: 'nope' }), 'invalid `type`'],
  ['unknown priority', () => mk({ priority: 'nope' }), 'invalid `priority`'],
  ['bad created', () => mk({ created: '03/01/2026', id: '03-x' }, { file: '03-x' }), '`created` must be'],
  ['empty targets', () => mk({ targets: {} }), 'missing field `targets`'],
  ['target is raiser', () => mk({ targets: { be: 'pending' } }), 'cannot target itself'],
  ['unknown status', () => mk({ targets: { fe: 'done' } }), 'invalid status'],
  ['uppercase slug', () => mk({ id: '2026-03-01-be-Add-Invoice' }, { file: '2026-03-01-be-Add-Invoice' }), 'kebab-case'],
];
for (const [name, build, frag] of bad) {
  test(`error: ${name}`, () => {
    const e = validateNote(build(), cfg());
    assert.equal(e.length, 1, e.join(' | '));
    assert.ok(e[0].includes(frag), e[0]);
  });
}

test('empty required value counts as missing', () => {
  assert.deepEqual(validateNote(mk({ title: '' }), cfg()), ['missing field `title`']);
});

test('flat config requires module general', () => {
  assert.deepEqual(validateNote(mk({}, { module: 'general' }), flatCfg()), []);
  const e = validateNote(mk({ module: 'billing' }, { module: 'billing', dir: 'notes' }), flatCfg());
  assert.equal(e.length, 1);
  assert.ok(e[0].includes('`general`'));
  const e2 = validateNote(mk({ module: 'general' }, { module: 'general', dir: 'elsewhere' }), flatCfg());
  assert.equal(e2.length, 1);
});

test('no frontmatter', () => {
  assert.equal(validateNote({ ...mk(), meta: null }, cfg()).length, 1);
});

test('isClosed', () => {
  assert.equal(isClosed({ targets: { fe: 'applied', qa: 'n/a' } }), true);
  assert.equal(isClosed({ targets: { fe: 'applied', qa: 'acked' } }), false);
});

test('isOpenForActive false when only paused side open', () => {
  const c = cfg({ paused: ['mobile'] });
  assert.equal(isOpenForActive({ targets: { mobile: 'pending', fe: 'applied' } }, c), false);
  assert.equal(isOpenForActive({ targets: { mobile: 'pending', fe: 'acked' } }, c), true);
});

test('byUrgency sorts blocker before low then by created', () => {
  const n = (priority, created) => ({ meta: { priority, created } });
  const arr = [n('low', '2026-01-01'), n('blocker', '2026-02-01'), n('blocker', '2026-01-05'), n('normal', '2026-01-01')];
  arr.sort(byUrgency);
  assert.deepEqual(arr.map((x) => `${x.meta.priority}@${x.meta.created}`),
    ['blocker@2026-01-05', 'blocker@2026-02-01', 'normal@2026-01-01', 'low@2026-01-01']);
});

test('listNoteFiles sorted, skips README and _TEMPLATE', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sk-list-'));
  const sync = path.join(root, 'sync');
  mkdirSync(path.join(sync, 'notes/billing'), { recursive: true });
  mkdirSync(path.join(sync, 'notes/orders'), { recursive: true });
  for (const f of ['notes/billing/b.md', 'notes/billing/a.md', 'notes/billing/README.md', 'notes/orders/_TEMPLATE.md', 'notes/orders/c.md', 'notes/orders/x.txt']) writeFileSync(path.join(sync, f), '');
  assert.deepEqual(listNoteFiles(sync, cfg()).map((f) => path.basename(f)), ['a.md', 'b.md', 'c.md']);
  assert.deepEqual(listNoteFiles(path.join(root, 'none'), cfg()), []);
});
