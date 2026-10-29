import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { makeTempRepo } from './helpers.mjs';
import { validateState, loadState } from '../kit/scripts/lib/state.mjs';
import { localDate } from '../kit/scripts/lib/io.mjs';

const stateFile = (r) => path.join(r.syncDir, '.kit', 'state.json');
const DECIDE = ['state', 'decide', '--topology', 'monorepo', '--ci', 'github', '--agent-file', 'CLAUDE.md', '--agent-file', 'AGENTS.md', '--channel', 'telegram', '--lang', 'en'];

async function inited() {
  const r = await makeTempRepo();
  const res = r.run(['state', 'init', '--kit-ref', 'v1.0.0']);
  assert.equal(res.code, 0, res.stderr);
  return r;
}

test('phase done writes valid json', async () => {
  const r = await inited();
  try {
    assert.equal(r.run(DECIDE).code, 0);
    const res = r.run(['state', 'phase', '01', 'done']);
    assert.equal(res.code, 0, res.stderr);
    const txt = readFileSync(stateFile(r), 'utf8');
    assert.ok(txt.endsWith('}\n'));
    const s = JSON.parse(txt);
    assert.deepEqual(validateState(s), []);
    assert.deepEqual(s.phases['01'], { status: 'done', at: localDate() });
    assert.equal(s.kitRef, 'v1.0.0');
    assert.equal(s.kitVersion, '1.0.0');
    assert.deepEqual(s.decisions.agentFiles, ['CLAUDE.md', 'AGENTS.md']);
    assert.deepEqual(loadState(r.syncDir), s);
    assert.equal(r.run(['state', 'show']).stdout, txt);
  } finally { await r.cleanup(); }
});

test('decide rejects topology hub', async () => {
  const r = await inited();
  try {
    const res = r.run(['state', 'decide', '--topology', 'hub']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /v1\.1/);
  } finally { await r.cleanup(); }
});

test('decide accepts ci gitlab + channel gchat', async () => {
  const r = await inited();
  try {
    const res = r.run(['state', 'decide', '--ci', 'gitlab', '--channel', 'gchat']);
    assert.equal(res.code, 0, res.stderr);
    const s = loadState(r.syncDir);
    assert.equal(s.decisions.ci, 'gitlab');
    assert.equal(s.decisions.channel, 'gchat');
  } finally { await r.cleanup(); }
});

test('decide rejects channel slack (mentions v1.1)', async () => {
  const r = await inited();
  try {
    const res = r.run(['state', 'decide', '--ci', 'github', '--channel', 'slack']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /v1\.1/);
  } finally { await r.cleanup(); }
});

test('decide rejects ci none with channel gchat', async () => {
  const r = await inited();
  try {
    const res = r.run(['state', 'decide', '--ci', 'none', '--channel', 'gchat']);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /require CI/);
    const raw = { kitVersion: '1.0.0', kitRef: 'x', phases: {}, decisions: { ci: 'none', channel: 'gchat' } };
    assert.match(validateState(raw).join('\n'), /require CI/);
  } finally { await r.cleanup(); }
});

test('invalid input writes nothing', async () => {
  const r = await makeTempRepo();
  try {
    assert.equal(r.run(['state', 'phase', '01', 'done']).code, 1); // no state yet
    assert.equal(existsSync(stateFile(r)), false);
    assert.equal(r.run(['state', 'init', '--kit-ref', 'v1.0.0']).code, 0);
    const before = readFileSync(stateFile(r), 'utf8');
    assert.equal(r.run(['state', 'phase', '07', 'done']).code, 1);
    assert.equal(r.run(['state', 'phase', '01', 'finished']).code, 1);
    assert.equal(r.run(['state', 'decide', '--ci', 'jenkins']).code, 1);
    assert.equal(r.run(['state', 'decide', '--ci', 'none', '--channel', 'telegram']).code, 1);
    assert.equal(readFileSync(stateFile(r), 'utf8'), before);
    assert.equal(r.run(['state', 'bogus']).code, 2);
    assert.equal(r.run(['state', 'init']).code, 2);
  } finally { await r.cleanup(); }
});

test('twice is byte-identical', async () => {
  const r = await makeTempRepo();
  try {
    const seq = [['state', 'init', '--kit-ref', 'v1.0.0'], DECIDE, ['state', 'phase', '00', 'done'], ['state', 'phase', '02', 'skipped']];
    for (const c of seq) assert.equal(r.run(c).code, 0);
    const a = readFileSync(stateFile(r), 'utf8');
    for (const c of seq) assert.equal(r.run(c).code, 0);
    assert.equal(readFileSync(stateFile(r), 'utf8'), a);
  } finally { await r.cleanup(); }
});

test('state today prints localDate', async () => {
  const r = await makeTempRepo();
  try {
    const res = r.run(['state', 'today']);
    assert.equal(res.code, 0);
    assert.equal(res.stdout.trim(), localDate());
  } finally { await r.cleanup(); }
});

test('decide --no-agent-files records an empty list', async () => {
  const r = await inited();
  try {
    assert.equal(r.run(DECIDE).code, 0);
    const res = r.run(['state', 'decide', '--no-agent-files']);
    assert.equal(res.code, 0, res.stderr);
    const st = JSON.parse(readFileSync(stateFile(r), 'utf8'));
    assert.deepEqual(st.decisions.agentFiles, []);
    assert.equal(st.decisions.ci, 'github');
    assert.deepEqual(validateState(st), []);
  } finally { await r.cleanup(); }
});

test('decide --no-agent-files with --agent-file is a usage error', async () => {
  const r = await inited();
  try {
    const before = readFileSync(stateFile(r), 'utf8');
    const res = r.run(['state', 'decide', '--no-agent-files', '--agent-file', 'CLAUDE.md']);
    assert.equal(res.code, 2);
    assert.equal(readFileSync(stateFile(r), 'utf8'), before);
    assert.equal(r.run(['state', 'decide', '--no-agent-files', 'x']).code, 2);
  } finally { await r.cleanup(); }
});
