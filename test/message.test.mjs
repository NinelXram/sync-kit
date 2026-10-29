import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, render, splitText, renderParts } from '../kit/scripts/lib/message.mjs';
import { remindSections } from '../kit/scripts/lib/events.mjs';

const cfg = (notify = {}, lang = 'en') => ({
  lang, sides: { be: 'BE', fe: 'FE' }, paused: [], modules: { billing: 'billing' },
  notify: { channel: 'telegram', managers: { be: ['@alice'], fe: ['@bob'] }, remindMaxItems: 5, siteUrl: '', ...notify },
});
const mk = (id, from, targets, title = `T ${id}`, priority = 'normal') => ({
  path: `sync/billing/${id}.md`, file: `/r/sync/billing/${id}.md`, body: '',
  meta: { id, title, module: 'billing', from, type: 'feature', priority, created: '2026-01-01', targets },
});
const ev = (kind, note, sides) => ({ kind, note, sides });

test('html escapes <script>', () => {
  const [m] = buildMessages([ev('new', mk('2026-01-01-fe-a', 'fe', { be: 'pending' }, 'x <script>alert(1)</script> & y'), ['be'])], cfg(), { sha: 'abc', env: {} });
  const out = render(m, 'html');
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; y/);
});

test('html keeps @alice mention', () => {
  const [m] = buildMessages([ev('new', mk('2026-01-01-fe-a', 'fe', { be: 'pending' }), ['be'])], cfg(), { sha: 'abc', env: {} });
  assert.deepEqual(m.mentions, ['@alice']);
  assert.match(render(m, 'html'), /(^|\n)@alice(\n|$)/);
});

test('disputed and closed mention the raising side managers', () => {
  const note = mk('2026-01-01-fe-a', 'fe', { be: 'disputed' });
  const [d, c] = buildMessages([ev('disputed', note, ['be']), ev('closed', note, ['be'])], cfg(), { sha: 'abc', env: {} });
  assert.deepEqual(d.mentions, ['@bob']);
  assert.deepEqual(c.mentions, ['@bob']);
});

test('html renders title bold and link as anchor', () => {
  const m = { icon: '📮', title: 'Hi', lines: ['a'], mentions: [], link: { url: 'https://x.test/a?b=1&c=2', text: 'see' } };
  assert.equal(render(m, 'html'), '📮 <b>Hi</b>\na\n🔗 <a href="https://x.test/a?b=1&amp;c=2">see</a>');
});

test('gchat renders title bold and link <url|text>', () => {
  const m = { icon: '📮', title: 'Hi', lines: ['a'], mentions: ['@alice'], link: { url: 'https://x.test/a', text: 'see' } };
  assert.equal(render(m, 'gchat'), '📮 *Hi*\na\n🔗 <https://x.test/a|see>');
});

test('gchat replaces < > in title and | in link text', () => {
  const m = { icon: '', title: 'a <b> c', lines: ['x <y>'], mentions: [], link: { url: 'https://x.test', text: 'p|q <r>' } };
  assert.equal(render(m, 'gchat'), '*a ‹b› c*\nx ‹y›\n🔗 <https://x.test|p¦q ‹r›>');
});

test('plain has no markup', () => {
  const m = { icon: '📮', title: 'Hi <b>', lines: ['a & b'], mentions: ['@alice'], link: { url: 'https://x.test', text: 'see' } };
  assert.equal(render(m, 'plain'), '📮 Hi <b>\na & b\n@alice\n🔗 see: https://x.test');
});

test('gchat has no mentions even when managers set', () => {
  const c = cfg({ channel: 'gchat' });
  const [m] = buildMessages([ev('new', mk('2026-01-01-fe-a', 'fe', { be: 'pending' }), ['be'])], c, { sha: 'abc', env: {} });
  assert.deepEqual(m.mentions, []);
  const [r] = buildMessages(remindSections([mk('2026-01-01-fe-a', 'fe', { be: 'pending' })], c), c);
  assert.deepEqual(r.mentions, []);
  assert.doesNotMatch(render({ ...m, mentions: ['@alice'] }, 'gchat'), /@alice/);
});

test('notify message threadKey equals note id, remind message has none', () => {
  const note = mk('2026-01-01-fe-a', 'fe', { be: 'pending' });
  const [m] = buildMessages([ev('new', note, ['be'])], cfg(), { sha: 'abc', env: {} });
  assert.equal(m.threadKey, '2026-01-01-fe-a');
  const [r] = buildMessages(remindSections([note], cfg()), cfg());
  assert.equal(r.threadKey, undefined);
  assert.deepEqual(r.mentions, ['@alice']);
});

test('notify link points to note file at sha; no CI env → path line, no link', () => {
  const note = mk('2026-01-01-fe-a', 'fe', { be: 'pending' });
  const [m] = buildMessages([ev('new', note, ['be'])], cfg({ siteUrl: 'https://dash.test' }), { sha: 'abc1', env: { GITHUB_REPOSITORY: 'acme/app' } });
  assert.equal(m.link.url, 'https://github.com/acme/app/blob/abc1/sync/billing/2026-01-01-fe-a.md');
  const [p] = buildMessages([ev('new', note, ['be'])], cfg(), { sha: 'abc1', env: {} });
  assert.equal(p.link, undefined);
  assert.ok(p.lines.some((l) => l.includes(note.path)));
});

test('limits to remindMaxItems with "and N more"', () => {
  const notes = Array.from({ length: 7 }, (_, i) => mk(`2026-01-01-fe-n${i}`, 'fe', { be: 'pending' }));
  const c = cfg({ remindMaxItems: 5 });
  const [m] = buildMessages(remindSections(notes, c), c);
  assert.equal(m.lines.filter((l) => l.includes('2026-01-01-fe-n')).length, 5);
  assert.ok(m.lines.some((l) => /and 2 more/.test(l)));
});

test('siteUrl set → remind message link is siteUrl with "Xem tiến độ" (vi)', () => {
  const notes = [mk('2026-01-01-fe-a', 'fe', { be: 'pending' }), mk('2026-01-01-be-b', 'be', { fe: 'pending' })];
  const c = cfg({ siteUrl: 'https://dash.example.test/sync' }, 'vi');
  const msgs = buildMessages(remindSections(notes, c), c);
  assert.equal(msgs.length, 2);
  for (const m of msgs) assert.deepEqual(m.link, { url: 'https://dash.example.test/sync', text: 'Xem tiến độ' });
});

test('siteUrl empty → remind message has no link', () => {
  const c = cfg();
  const [m] = buildMessages(remindSections([mk('2026-01-01-fe-a', 'fe', { be: 'pending' })], c), c);
  assert.equal(m.link, undefined);
});

test('splitText 4500-char text with limit 2000 → 3 parts, parts.join(\'\\n\') equals original', () => {
  const text = Array.from({ length: 45 }, (_, i) => String(i).padStart(2, '0').padEnd(99, 'x')).join('\n');
  assert.equal(text.length, 4499);
  const parts = splitText(text, 2000);
  assert.equal(parts.length, 3);
  assert.equal(parts.join('\n'), text);
});

test('splitText never exceeds limit', () => {
  const text = ['short', 'y'.repeat(5000), 'z'.repeat(30), ''].join('\n');
  const parts = splitText(text, 1000);
  for (const p of parts) assert.ok(p.length <= 1000, `part ${p.length}`);
  assert.equal(parts.join('').replace(/\n/g, ''), text.replace(/\n/g, ''));
});

const balanced = (s) => {
  const stack = [];
  for (const [, close, name] of s.matchAll(/<(\/?)(b|a)\b[^>]*>/g)) {
    if (!close) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
};

test('renderParts html with 5000-char line containing a link: every part ≤ 4096, every part has balanced tags, no part ends inside "&amp;"', () => {
  const line = 'see https://x.test/?a=1&b=2 <tag> '.repeat(150).slice(0, 5000);
  const m = { icon: '📮', title: 'Title & <more>', lines: ['intro', line, 'tail'], mentions: ['@alice'], link: { url: 'https://x.test/n?a=1&b=2', text: 'view' } };
  const parts = renderParts(m, 'html', 4096);
  assert.ok(parts.length >= 2);
  for (const p of parts) {
    assert.ok(p.length <= 4096, `part ${p.length}`);
    assert.ok(balanced(p), 'balanced');
    assert.doesNotMatch(p, /&[a-z]{0,3}$/);
    assert.doesNotMatch(p, /<[^>]*$/);
  }
  const all = parts.join('\n');
  assert.ok(all.includes('<a href="https://x.test/n?a=1&amp;b=2">view</a>'));
  assert.ok(all.includes('@alice'));
  const plain = all.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n/g, '');
  assert.ok(plain.includes(line));
});

test('renderParts gchat 9000-char message → every part ≤ 4096, no part ends inside "<url|"', () => {
  const lines = Array.from({ length: 90 }, (_, i) => `line ${i} `.padEnd(99, 'q'));
  const m = { icon: '⏰', title: 'Big', lines, mentions: [], link: { url: 'https://x.test/progress', text: 'View progress' } };
  const parts = renderParts(m, 'gchat', 4096);
  assert.ok(parts.length >= 3);
  for (const p of parts) {
    assert.ok(p.length <= 4096);
    assert.doesNotMatch(p, /<[^>]*$/);
  }
  assert.ok(parts.at(-1).endsWith('<https://x.test/progress|View progress>'));
  assert.ok(parts.join('\n').includes(lines[89]));
});

test('renderParts small message → one part equal to render', () => {
  const m = { icon: '📮', title: 'Hi', lines: ['a'], mentions: ['@alice'], link: { url: 'https://x.test', text: 'see' } };
  for (const f of ['html', 'gchat', 'plain']) assert.deepEqual(renderParts(m, f, 4096), [render(m, f)]);
});
