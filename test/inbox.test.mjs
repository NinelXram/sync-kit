import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validateConfig } from '../kit/scripts/lib/config.mjs';
import { renderInbox, inboxFiles } from '../kit/scripts/lib/inbox.mjs';

const cfg = (extra = {}) => validateConfig({
  kitVersion: '1.0.0', sides: { be: 'BE', fe: 'FE', qa: 'QA', mobile: 'Mobile' },
  modules: { billing: 'notes/billing', orders: 'notes/orders' },
  strict: { since: '2026-01-01' }, ...extra,
}).config;

const note = (slug, over = {}) => {
  const from = over.from ?? 'be';
  const created = over.created ?? '2026-03-01';
  const module = over.module ?? 'billing';
  const id = `${created}-${from}-${slug}`;
  const meta = { id, title: slug, module, from, type: 'feature', priority: 'normal', created, targets: { fe: 'pending' }, ...over };
  return { path: `sync/notes/${module}/${id}.md`, file: path.join('/x/sync/notes', module, `${id}.md`), meta, body: '' };
};

const NOTES = () => [
  note('add-invoice', { title: 'Add invoice endpoint', priority: 'high', targets: { fe: 'pending', qa: 'acked', mobile: 'pending' } }),
  note('order-status', { title: 'Order status enum', module: 'orders', type: 'breaking', priority: 'blocker', created: '2026-03-02', targets: { fe: 'acked' } }),
  note('retry-field', { title: 'Retry field mismatch', from: 'fe', type: 'bug-report', created: '2026-03-03', targets: { be: 'disputed' } }),
  note('mobile-only', { title: 'Mobile push payload', module: 'orders', created: '2026-03-04', targets: { mobile: 'pending' } }),
  note('old-thing', { title: 'Old closed note', created: '2026-02-01', targets: { fe: 'applied', qa: 'n/a' } }),
];
const config = (lang) => cfg({ lang, paused: ['mobile'] });

const fx = (name) => new URL(`./fixtures/inbox/${name}.md`, import.meta.url);
for (const lang of ['en', 'vi']) {
  test(`renders inbox ${lang}`, () => {
    const out = renderInbox(NOTES(), config(lang)) + '\n';
    if (process.env.UPDATE_SNAPSHOTS === '1') writeFileSync(fx(lang), out);
    assert.ok(existsSync(fx(lang)), `missing fixture ${lang}.md (run with UPDATE_SNAPSHOTS=1)`);
    assert.equal(out, readFileSync(fx(lang), 'utf8'));
  });
}

test('paused side shows pointer line and writes INBOX-MOBILE.md', () => {
  const c = config('en');
  const main = renderInbox(NOTES(), c);
  assert.match(main, /## Mobile\n\n_Paused — 2 note\(s\) waiting on Mobile, see \[INBOX-MOBILE\.md\]\(INBOX-MOBILE\.md\)\._/);
  assert.match(main, /Waiting only on paused sides: \*\*1\*\*/);
  const files = inboxFiles(NOTES(), c, '/x/sync');
  assert.deepEqual(files.map(([p]) => path.basename(p)), ['INBOX.md', 'INBOX-MOBILE.md']);
  assert.match(files[1][1], /^# Sync Inbox — Mobile \(paused\)/);
  assert.match(files[1][1], /mobile-only/);
  assert.ok(files.every(([, c2]) => c2.endsWith('\n') && !c2.endsWith('\n\n')));
});

test('disputed note appears under raiser\'s "awaiting reply"', () => {
  const out = renderInbox(NOTES(), config('en'));
  const fe = out.split('## FE')[1].split('## ')[0];
  assert.match(fe, /Disputed — raising side must reply/);
  assert.match(fe, /retry-field.*\| BE \|$/m);
});

test('escapes pipe in title', () => {
  const out = renderInbox([note('x', { title: 'a | b\nc' })], config('en'));
  assert.ok(out.includes('| a \\| b c |'), out);
});

test('empty inbox prints no-pending line', () => {
  const out = renderInbox([], cfg());
  assert.match(out, /Open: \*\*0\*\* · Closed: \*\*0\*\*/);
  assert.equal(out.match(/_No pending work\._/g).length, 4);
});

test('skips notes without meta or failing validation', () => {
  const bad = { path: 'sync/notes/billing/z.md', file: '/x/z.md', meta: null, body: '' };
  const bad2 = note('y', { targets: undefined });
  assert.doesNotThrow(() => renderInbox([bad, bad2, ...NOTES()], config('en')));
});

test('output is deterministic', () => {
  assert.equal(renderInbox(NOTES(), config('vi')), renderInbox(NOTES(), config('vi')));
});
