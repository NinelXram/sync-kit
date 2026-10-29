import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTempRepo } from './helpers.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'scripts');

const cfg = (over = {}) =>
  JSON.stringify({
    kitVersion: '1.0.0',
    lang: 'en',
    topology: 'monorepo',
    sides: { be: 'BE', fe: 'FE' },
    modules: { billing: 'billing', orders: 'orders' },
    strict: { enabled: true, since: '2020-01-01' },
    ...over,
  });

async function setup(over, files = {}) {
  return makeTempRepo({ 'sync/sync.config.json': cfg(over), ...files });
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (f === 'scripts') continue;
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

const NEW = ['new', '--module', 'billing', '--from', 'be', '--to', 'fe', '--type', 'feature', '--slug', 'add-invoice', '--title', 'Add invoice', '--author', '@alice'];

test('init twice is byte-identical', async () => {
  const r = await setup();
  try {
    assert.equal(r.run(['init']).code, 0);
    const a = snapshot(r.syncDir);
    assert.ok(a['README.md'] && a['_TEMPLATE.md'] && a['INBOX.md']);
    assert.ok(existsSync(path.join(r.syncDir, 'billing')) && existsSync(path.join(r.syncDir, 'orders')));
    assert.equal(r.run(['init']).code, 0);
    assert.deepEqual(snapshot(r.syncDir), a);
    assert.match(a['README.md'], /\| `be` \| BE \|/);
  } finally { await r.cleanup(); }
});

test('init preserves project-rules block content', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const f = path.join(r.syncDir, 'README.md');
    const txt = readFileSync(f, 'utf8').replace(/TODO[^\n]*/, 'Our own rule: ping @alice.');
    writeFileSync(f, txt);
    r.run(['init']);
    const after = readFileSync(f, 'utf8');
    assert.match(after, /Our own rule: ping @alice\./);
    assert.ok(!after.includes('TODO'));
  } finally { await r.cleanup(); }
});

test('init writes TODO marker line in fresh project-rules block', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const txt = readFileSync(path.join(r.syncDir, 'README.md'), 'utf8');
    const m = txt.match(/project-rules:start -->\n([\s\S]*?)\n<!-- sync-kit:project-rules:end/);
    assert.match(m[1], /TODO/);
  } finally { await r.cleanup(); }
});

test('init with inbox.commit=false appends .gitignore once', async () => {
  const r = await setup({ inbox: { commit: false } }, { '.gitignore': 'node_modules/' });
  try {
    r.run(['init']);
    r.run(['init']);
    const gi = readFileSync(path.join(r.root, '.gitignore'), 'utf8');
    assert.equal(gi, 'node_modules/\nsync/INBOX*.md\n');
  } finally { await r.cleanup(); }
});

test('init with inbox.commit=false creates .gitignore when missing', async () => {
  const r = await setup({ inbox: { commit: false } });
  try {
    r.run(['init']);
    assert.equal(readFileSync(path.join(r.root, '.gitignore'), 'utf8'), 'sync/INBOX*.md\n');
  } finally { await r.cleanup(); }
});

test('new creates valid note and inbox then check exits 0', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const n = r.run(NEW);
    assert.equal(n.code, 0, n.stderr);
    assert.equal(r.run(['inbox']).code, 0);
    const c = r.run(['check']);
    assert.equal(c.code, 0, c.stdout + c.stderr);
    const files = readdirSync(path.join(r.syncDir, 'billing'));
    assert.equal(files.length, 1);
    const txt = readFileSync(path.join(r.syncDir, 'billing', files[0]), 'utf8');
    assert.match(txt, /author: "@alice"/);
    assert.match(txt, /## Discussion/);
  } finally { await r.cleanup(); }
});

test('new in flat layout defaults module to general', async () => {
  const r = await setup({ modules: {} });
  try {
    r.run(['init']);
    const args = NEW.filter((_, i) => i !== 1 && i !== 2);
    const n = r.run(args);
    assert.equal(n.code, 0, n.stderr);
    r.run(['inbox']);
    assert.equal(readdirSync(path.join(r.syncDir, 'notes')).length, 1);
    assert.equal(r.run(['check']).code, 0);
  } finally { await r.cleanup(); }
});

test('new rejects bad slug and missing args', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const bad = NEW.map((v) => (v === 'add-invoice' ? 'Bad Slug' : v));
    assert.equal(r.run(bad).code, 1);
    assert.equal(r.run(['new']).code, 2);
  } finally { await r.cleanup(); }
});

test('new uses local date', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const env = { ...process.env, TZ: 'Asia/Ho_Chi_Minh', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e.x' };
    const run = spawnSync(process.execPath, ['sync/scripts/sync.mjs', ...NEW], { cwd: r.root, env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const probe = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `import {localDate} from ${JSON.stringify(pathToFileURL(path.join(KIT, 'lib', 'io.mjs')).href)}; console.log(localDate())`],
      { env, encoding: 'utf8' },
    );
    const today = probe.stdout.trim();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    const f = readdirSync(path.join(r.syncDir, 'billing'))[0];
    assert.ok(f.startsWith(`${today}-be-`), f);
    assert.match(readFileSync(path.join(r.syncDir, 'billing', f), 'utf8'), new RegExp(`created: ${today}`));
  } finally { await r.cleanup(); }
});

test('check exits 1 and names file when note invalid', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    writeFileSync(path.join(r.syncDir, 'billing', '2026-01-01-be-broken.md'), '# no frontmatter\n');
    const c = r.run(['check']);
    assert.equal(c.code, 1);
    assert.match(c.stdout, /error: sync\/billing\/2026-01-01-be-broken\.md:/);
  } finally { await r.cleanup(); }
});

test('check exits 0 with warning on unknown entry status', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    r.run(NEW);
    const dir = path.join(r.syncDir, 'billing');
    const f = path.join(dir, readdirSync(dir)[0]);
    appendFileSync(f, '\n### [FE] 2026-10-29 @alice — weirdstatus\nhello\n');
    r.run(['inbox']);
    const c = r.run(['check']);
    assert.equal(c.code, 0, c.stdout);
    assert.match(c.stdout, /warning: sync\/billing\/.*unknown status "weirdstatus"/);
  } finally { await r.cleanup(); }
});

test('check under GITLAB_CI prints "error: <file>:" not "::error"', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    writeFileSync(path.join(r.syncDir, 'billing', '2026-01-01-be-broken.md'), 'x\n');
    const env = { ...process.env, GITLAB_CI: 'true', GITHUB_ACTIONS: '' };
    const run = spawnSync(process.execPath, ['sync/scripts/sync.mjs', 'check'], { cwd: r.root, env, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /^error: sync\/billing\/2026-01-01-be-broken\.md:/m);
    assert.ok(!run.stdout.includes('::error'));
  } finally { await r.cleanup(); }
});

test('check exits 1 when INBOX stale', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    r.run(NEW);
    const c = r.run(['check']);
    assert.equal(c.code, 1);
    assert.match(c.stdout, /error: sync\/INBOX\.md:/);
  } finally { await r.cleanup(); }
});

test('check ignores INBOX when inbox.commit=false', async () => {
  const r = await setup({ inbox: { commit: false } });
  try {
    r.run(['init']);
    r.run(NEW);
    assert.equal(r.run(['check']).code, 0);
  } finally { await r.cleanup(); }
});

test('unknown command exits 2', async () => {
  const r = await setup();
  try {
    assert.equal(r.run(['bogus']).code, 2);
    assert.equal(r.run([]).code, 2);
  } finally { await r.cleanup(); }
});

test('missing config exits 1 with hint to run phase 01', async () => {
  const r = await makeTempRepo();
  try {
    const c = r.run(['check']);
    assert.equal(c.code, 1);
    assert.match(c.stderr, /phase 01/);
    assert.match(c.stderr, /01-install\.md/);
  } finally { await r.cleanup(); }
});

test('--sync-dir overrides the computed sync dir', async () => {
  const r = await setup();
  try {
    const run = spawnSync(process.execPath, [path.join(KIT, 'sync.mjs'), 'init', '--sync-dir', 'sync'], { cwd: r.root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(existsSync(path.join(r.syncDir, 'INBOX.md')));
  } finally { await r.cleanup(); }
});

test('version prints contents of VERSION', async () => {
  const r = await makeTempRepo();
  try {
    const v = r.run(['version']);
    assert.equal(v.code, 0);
    assert.equal(v.stdout.trim(), readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim());
  } finally { await r.cleanup(); }
});

test('new round-trips quotes and backslashes in title; rejects newline', async () => {
  const r = await setup();
  try {
    r.run(['init']);
    const title = 'Add "status" field \ x';
    const args = NEW.map((v) => (v === 'Add invoice' ? title : v));
    const n = r.run(args);
    assert.equal(n.code, 0, n.stderr);
    const dir = path.join(r.syncDir, 'billing');
    const f = path.join(dir, readdirSync(dir)[0]);
    const { parseFrontmatter } = await import(pathToFileURL(path.join(KIT, 'lib', 'frontmatter.mjs')).href);
    assert.equal(parseFrontmatter(readFileSync(f, 'utf8')).title, title);
    r.run(['inbox']);
    assert.equal(r.run(['check']).code, 0);
    assert.equal(r.run(NEW.map((v) => (v === 'Add invoice' ? 'a\nb' : v)).map((v) => (v === 'add-invoice' ? 'other' : v))).code, 1);
  } finally { await r.cleanup(); }
});
