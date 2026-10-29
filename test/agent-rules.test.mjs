import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { upsertBlock, renderBlock, START, END } from '../kit/scripts/lib/agentRules.mjs';
import { makeTempRepo } from './helpers.mjs';

const config = {
  lang: 'en', sides: { be: 'BE', fe: 'FE' }, contract: { globs: { be: ['backend/**/*.dto.ts'], fe: ['*.proto'] } },
};
const cfgJson = (lang = 'en') => JSON.stringify({
  kitVersion: '1.0.0', lang, topology: 'monorepo', sides: { be: 'BE', fe: 'FE' },
  modules: { billing: 'billing' }, strict: { enabled: true, since: '2020-01-01' },
  contract: { globs: { be: ['backend/**/*.dto.ts'] } },
});

test('appends block to file without markers', () => {
  const out = upsertBlock('# Rules\nbe nice\n', 'BLOCK');
  assert.equal(out, `# Rules\nbe nice\n\n${START}\nBLOCK\n${END}\n`);
});

test('replaces only between markers', () => {
  const before = 'top  \r\n\n';
  const after = '\n\ntail no newline';
  const src = `${before}${START}\nold\n${END}${after}`;
  const out = upsertBlock(src, 'new');
  assert.equal(out, `${before}${START}\nnew\n${END}${after}`);
});

test('twice is idempotent', () => {
  const block = renderBlock(config);
  const once = upsertBlock('hello', block);
  assert.equal(upsertBlock(once, block), once);
  assert.equal(once.split(START).length, 2);
});

test('block lists contract globs from config and uses fixed engine path', () => {
  const b = renderBlock(config);
  assert.match(b, /backend\/\*\*\/\*\.dto\.ts/);
  assert.match(b, /\*\.proto/);
  assert.match(b, /node sync\/scripts\/sync\.mjs new/);
  assert.doesNotMatch(b, /\$KIT|\{\{/);
  assert.match(renderBlock({ ...config, lang: 'vi' }), /Giao thức/);
});

test('CLI creates .mdc with alwaysApply frontmatter, md plain; rerun byte-identical', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson(), 'AGENTS.md': '# Mine\n' });
  try {
    const args = ['agent-rules', '--file', '.cursor/rules/sync.mdc', '--file', 'AGENTS.md', '--file', 'CLAUDE.md'];
    assert.equal(r.run(args).code, 0);
    const mdc = readFileSync(path.join(r.root, '.cursor/rules/sync.mdc'), 'utf8');
    assert.ok(mdc.startsWith('---\ndescription: sync-kit sync notes protocol\nalwaysApply: true\n---\n'));
    assert.ok(mdc.includes(START));
    assert.ok(readFileSync(path.join(r.root, 'AGENTS.md'), 'utf8').startsWith('# Mine\n\n' + START));
    assert.ok(!readFileSync(path.join(r.root, 'CLAUDE.md'), 'utf8').startsWith('---'));
    const snap = ['.cursor/rules/sync.mdc', 'AGENTS.md', 'CLAUDE.md'].map((f) => readFileSync(path.join(r.root, f), 'utf8'));
    assert.equal(r.run(args).code, 0);
    const snap2 = ['.cursor/rules/sync.mdc', 'AGENTS.md', 'CLAUDE.md'].map((f) => readFileSync(path.join(r.root, f), 'utf8'));
    assert.deepEqual(snap2, snap);
  } finally { await r.cleanup(); }
});

test('existing .mdc only gets block upserted; no --file exits 2', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson(), 'x.mdc': 'custom\n' });
  try {
    assert.equal(r.run(['agent-rules']).code, 2);
    assert.equal(r.run(['agent-rules', '--file', 'x.mdc']).code, 0);
    const t = readFileSync(path.join(r.root, 'x.mdc'), 'utf8');
    assert.ok(t.startsWith('custom\n\n' + START));
    assert.ok(!t.includes('alwaysApply'));
  } finally { await r.cleanup(); }
});

test('CRLF + BOM file: BOM and CRLF preserved, only the inserted block differs; rerun byte-identical', async () => {
  const orig = '\uFEFF# Mine\r\nline two  \r\n\r\nlast\r\n';
  const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson(), 'CLAUDE.md': orig });
  try {
    const abs = path.join(r.root, 'CLAUDE.md');
    assert.equal(r.run(['agent-rules', '--file', 'CLAUDE.md']).code, 0);
    const out = readFileSync(abs, 'utf8');
    assert.ok(out.startsWith(orig), 'original bytes kept as prefix');
    const added = out.slice(orig.length);
    assert.ok(added.startsWith(`\r\n${START}\r\n`));
    assert.ok(added.endsWith(`${END}\r\n`));
    assert.doesNotMatch(added.replace(/\r\n/g, ''), /\n/, 'every inserted line ends with CRLF');
    const first = readFileSync(abs);
    assert.equal(r.run(['agent-rules', '--file', 'CLAUDE.md']).code, 0);
    assert.ok(readFileSync(abs).equals(first));
  } finally { await r.cleanup(); }
});

test('CRLF file with existing block: block replaced with CRLF lines, outside untouched', async () => {
  const orig = `# Mine\r\n\r\n${START}\r\nold\r\n${END}\r\ntail\r\n`;
  const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson(), 'AGENTS.md': orig });
  try {
    assert.equal(r.run(['agent-rules', '--file', 'AGENTS.md']).code, 0);
    const out = readFileSync(path.join(r.root, 'AGENTS.md'), 'utf8');
    assert.ok(out.startsWith(`# Mine\r\n\r\n${START}\r\n`));
    assert.ok(out.endsWith(`${END}\r\ntail\r\n`));
    assert.ok(!out.includes('old'));
    assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/);
    assert.ok(!out.startsWith('\uFEFF'));
  } finally { await r.cleanup(); }
});

test('new file is LF without BOM', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson() });
  try {
    assert.equal(r.run(['agent-rules', '--file', 'CLAUDE.md']).code, 0);
    const out = readFileSync(path.join(r.root, 'CLAUDE.md'), 'utf8');
    assert.ok(!out.includes('\r') && !out.startsWith('\uFEFF'));
  } finally { await r.cleanup(); }
});

for (const [name, content] of [
  ['start without end', `# Mine\n${START}\nhalf\n`],
  ['end without start', `# Mine\nhalf\n${END}\n`],
  ['end before start', `# Mine\n${END}\nx\n${START}\n`],
  ['two starts', `${START}\na\n${END}\n${START}\nb\n${END}\n`],
]) {
  test(`orphan markers (${name}): refuse, exit 1, file untouched`, async () => {
    const r = await makeTempRepo({ 'sync/sync.config.json': cfgJson(), 'CLAUDE.md': content, 'AGENTS.md': '# ok\n' });
    try {
      const res = r.run(['agent-rules', '--file', 'AGENTS.md', '--file', 'CLAUDE.md']);
      assert.equal(res.code, 1);
      assert.match(res.stderr, /CLAUDE\.md/);
      assert.match(res.stderr, /by hand/);
      assert.equal(readFileSync(path.join(r.root, 'CLAUDE.md'), 'utf8'), content);
      assert.equal(readFileSync(path.join(r.root, 'AGENTS.md'), 'utf8'), '# ok\n');
    } finally { await r.cleanup(); }
  });
}
