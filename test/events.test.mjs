import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectEvents, noteLink, remindSections } from '../kit/scripts/lib/events.mjs';

const config = {
  lang: 'en', sides: { be: 'BE', fe: 'FE', qa: 'QA' }, paused: [],
  modules: { billing: 'billing' },
  notify: { channel: 'telegram', managers: {}, remindMaxItems: 5, siteUrl: '' },
};

const note = (targets, extra = {}) => {
  const meta = {
    id: '2026-01-05-fe-add-x', title: 'Add x', module: 'billing', from: 'fe', type: 'feature',
    priority: 'high', created: '2026-01-05', ...extra,
  };
  const fm = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
  const tg = Object.entries(targets).map(([s, st]) => `  ${s}: ${st}`).join('\n');
  return `---\n${fm}\ntargets:\n${tg}\n---\nbody\n`;
};
const P = 'sync/billing/2026-01-05-fe-add-x.md';

/** Fake git: files[sha][path] = text; records calls. */
function fakeGit(files, { diffThrows = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'diff') {
      if (diffThrows) throw new Error('bad revision');
      const [, , a, b] = args;
      const paths = new Set([...Object.keys(files[a] ?? {}), ...Object.keys(files[b] ?? {})]);
      return [...paths].join('\n') + '\n';
    }
    if (args[0] === 'show') {
      const [sha, path] = args[1].split(/:(.*)/s);
      const t = files[sha]?.[path];
      if (t === undefined) throw new Error('not found');
      return t;
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  return { git, calls };
}

test('new note → kind new, sides = open targets', () => {
  const { git } = fakeGit({ A: {}, B: { [P]: note({ be: 'pending', qa: 'n/a' }), 'sync/README.md': 'x' } });
  const ev = collectEvents({ before: 'A', after: 'B', config, git });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'new');
  assert.deepEqual(ev[0].sides, ['be']);
  assert.equal(ev[0].note.path, P);
  assert.equal(ev[0].note.meta.id, '2026-01-05-fe-add-x');
});

test('newly disputed → kind disputed', () => {
  const { git } = fakeGit({ A: { [P]: note({ be: 'pending', qa: 'acked' }) }, B: { [P]: note({ be: 'disputed', qa: 'acked' }) } });
  const ev = collectEvents({ before: 'A', after: 'B', config, git });
  assert.deepEqual(ev.map((e) => e.kind), ['disputed']);
  assert.deepEqual(ev[0].sides, ['be']);
});

test('still disputed → no event', () => {
  const { git } = fakeGit({ A: { [P]: note({ be: 'disputed' }) }, B: { [P]: note({ be: 'disputed' }) } });
  assert.deepEqual(collectEvents({ before: 'A', after: 'B', config, git }), []);
});

test('all done → kind closed only once', () => {
  const files = {
    A: { [P]: note({ be: 'acked', qa: 'applied' }) },
    B: { [P]: note({ be: 'applied', qa: 'applied' }) },
    C: { [P]: note({ be: 'n/a', qa: 'applied' }) },
  };
  const { git } = fakeGit(files);
  assert.deepEqual(collectEvents({ before: 'A', after: 'B', config, git }).map((e) => e.kind), ['closed']);
  assert.deepEqual(collectEvents({ before: 'B', after: 'C', config, git }), []);
});

test('before zeros → uses after~1', () => {
  for (const before of ['0'.repeat(40), '', undefined]) {
    const { git, calls } = fakeGit({ 'B~1': {}, B: { [P]: note({ be: 'pending' }) } });
    const ev = collectEvents({ before, after: 'B', config, git });
    assert.equal(ev.length, 1);
    assert.deepEqual(calls[0].slice(0, 4), ['diff', '--name-only', 'B~1', 'B']);
  }
});

test('git throws → []', () => {
  const { git } = fakeGit({}, { diffThrows: true });
  assert.deepEqual(collectEvents({ before: 'A', after: 'B', config, git }), []);
});

test('deleted note and non-note files are ignored', () => {
  const { git } = fakeGit({ A: { [P]: note({ be: 'pending' }) }, B: { 'sync/billing/_TEMPLATE.md': note({ be: 'pending' }), 'sync/other/x.md': note({ be: 'pending' }) } });
  assert.deepEqual(collectEvents({ before: 'A', after: 'B', config, git }), []);
});

test('link uses resolved sha, never "main"', () => {
  const env = { GITHUB_REPOSITORY: 'acme/app', GITHUB_SERVER_URL: 'https://github.example.com' };
  const url = noteLink('sync/notes/x.md', '0123abcd', env);
  assert.equal(url, 'https://github.example.com/acme/app/blob/0123abcd/sync/notes/x.md');
  assert.doesNotMatch(url, /\/main\//);
  assert.equal(noteLink('sync/notes/x.md', 'ff00', { GITHUB_REPOSITORY: 'acme/app' }), 'https://github.com/acme/app/blob/ff00/sync/notes/x.md');
});

test('gitlab link uses CI_PROJECT_URL with subpath', () => {
  const env = { CI_PROJECT_URL: 'https://git.example.local:8443/gitlab/team/app' };
  assert.equal(noteLink('sync/notes/x.md', 'abc123', env), 'https://git.example.local:8443/gitlab/team/app/-/blob/abc123/sync/notes/x.md');
});

test('no CI env → link null', () => {
  assert.equal(noteLink('sync/notes/x.md', 'abc', {}), null);
});

const n = (id, from, targets, priority = 'normal', created = '2026-01-01') => ({
  path: `sync/billing/${id}.md`, file: `/r/sync/billing/${id}.md`, body: '',
  meta: { id, title: `T ${id}`, module: 'billing', from, type: 'feature', priority, created, targets },
});

test('remindSections: incoming sorted by urgency, awaitingReply, skips empty sides', () => {
  const notes = [
    n('2026-01-01-fe-a', 'fe', { be: 'pending' }, 'low'),
    n('2026-01-01-fe-b', 'fe', { be: 'acked' }, 'blocker'),
    n('2026-01-01-be-c', 'be', { fe: 'disputed' }),
    n('2026-01-01-be-d', 'be', { fe: 'applied' }),
  ];
  const s = remindSections(notes, { ...config, modules: {} , sides: { be: 'BE', fe: 'FE', qa: 'QA' } });
  const s2 = remindSections(notes, config);
  assert.deepEqual(s, []);
  assert.deepEqual(s2.map((x) => x.side), ['be', 'fe']);
  assert.deepEqual(s2[0].incoming.map((x) => x.meta.id), ['2026-01-01-fe-b', '2026-01-01-fe-a']);
  assert.deepEqual(s2[0].awaitingReply.map((x) => x.meta.id), ['2026-01-01-be-c']);
  assert.deepEqual(s2[1].incoming.map((x) => x.meta.id), ['2026-01-01-be-c']);
});

test('remindSections skips paused', () => {
  const notes = [n('2026-01-01-fe-a', 'fe', { be: 'pending', qa: 'pending' })];
  const s = remindSections(notes, { ...config, paused: ['qa'] });
  assert.deepEqual(s.map((x) => x.side), ['be']);
});
