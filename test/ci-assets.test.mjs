import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CI = path.join(ROOT, 'kit', 'ci');
const CMD_DIR = path.join(ROOT, 'kit', 'scripts', 'lib', 'commands');
const GH = ['sync-check.yml', 'sync-notify.yml', 'sync-reminder.yml'].map((f) => path.join(CI, 'github', f));
const GL = ['sync-check.gitlab-ci.yml', 'sync-notify.gitlab-ci.yml'].map((f) => path.join(CI, 'gitlab', f));
const HOOK = path.join(CI, 'hooks', 'pre-commit');
const read = (f) => readFileSync(f, 'utf8');
const ALL = [...GH, ...GL, HOOK];
const GL_VARS = new Set(['CI_PIPELINE_SOURCE', 'CI_MERGE_REQUEST_DIFF_BASE_SHA', 'CI_COMMIT_BEFORE_SHA', 'CI_COMMIT_SHA', 'CI_COMMIT_BRANCH', 'CI_DEFAULT_BRANCH', 'SYNC_REMIND']);

test('all ci files exist and contain only LF', () => {
  for (const f of ALL) {
    assert.ok(existsSync(f), f);
    assert.ok(!read(f).includes('\r'), `CRLF in ${f}`);
  }
});

test('every sync.mjs command called exists', () => {
  const cmds = new Set(readdirSync(CMD_DIR).map((f) => f.replace(/\.mjs$/, '')));
  for (const f of ALL) {
    for (const m of read(f).matchAll(/sync\.mjs\s+([a-z-]+)/g)) assert.ok(cmds.has(m[1]), `${f}: ${m[1]}`);
  }
});

test('node-version is 22 everywhere', () => {
  for (const f of GH) {
    const vs = [...read(f).matchAll(/node-version:\s*['"]?([^'"\s]+)/g)].map((m) => m[1]);
    assert.ok(vs.length >= 1, f);
    for (const v of vs) assert.equal(v, '22');
  }
});

test('only whitelisted placeholders', () => {
  for (const f of ALL) {
    const t = read(f);
    for (const m of t.matchAll(/__[A-Z_]+__/g)) assert.equal(m[0], '__DEFAULT_BRANCH__', f);
    for (const m of t.matchAll(/#\s*(SYNC_KIT_[A-Z_]+)/g)) {
      assert.ok(['SYNC_KIT_CRON', 'SYNC_KIT_RUNNER_TAGS'].includes(m[1]), `${f}: ${m[1]}`);
    }
  }
});

test('pre-commit: shebang, runs check, tracked as 100755', () => {
  const t = read(HOOK);
  assert.ok(t.startsWith('#!/bin/sh\n'));
  assert.ok(t.includes('node sync/scripts/sync.mjs check || exit 1'));
  const r = spawnSync('git', ['ls-files', '-s', 'kit/ci/hooks/pre-commit'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(r.stdout, /^100755 /);
});

test('github sync-check', () => {
  const t = read(GH[0]);
  assert.match(t, /pull_request/);
  assert.match(t, /fetch-depth:\s*0/);
  assert.match(t, /permissions:\s*\n\s+contents:\s*read/);
  assert.ok(t.includes('node sync/scripts/sync.mjs check'));
  assert.ok(t.includes('BASE_SHA: ${{ github.event.pull_request.base.sha }}'));
  assert.ok(t.includes('node sync/scripts/sync.mjs contract-check --base "$BASE_SHA" --head HEAD'));
});

test('github sync-notify and reminder', () => {
  const n = read(GH[1]);
  assert.ok(n.includes('__DEFAULT_BRANCH__'));
  assert.match(n, /sync\/\*\*/);
  assert.match(n, /permissions:\s*\n\s+contents:\s*read/);
  for (const s of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'GCHAT_WEBHOOK_URL']) assert.ok(n.includes(`${s}: \${{ secrets.${s} }}`), s);
  assert.ok(n.includes('notify --before ${{ github.event.before }} --after ${{ github.sha }}'));
  const r = read(GH[2]);
  assert.equal([...r.matchAll(/^\s*#\s*SYNC_KIT_CRON\s*$/gm)].length, 1);
  assert.ok(r.includes('0 2 * * 1-5'));
  assert.ok(r.includes('sync.mjs remind'));
  assert.match(r, /permissions:\s*\n\s+contents:\s*read/);
  for (const s of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'GCHAT_WEBHOOK_URL']) assert.ok(r.includes(`secrets.${s}`), s);
});

test('github: every $VAR in run is declared in env', () => {
  for (const f of GH) {
    const lines = read(f).split('\n');
    const envNames = new Set();
    for (const l of lines) { const m = l.match(/^\s+([A-Z][A-Z0-9_]*):\s/); if (m) envNames.add(m[1]); }
    for (const l of lines) {
      if (!/^\s*(-\s+)?run:|^\s{10,}\S/.test(l) && !/node sync\//.test(l)) continue;
      if (!/node sync\//.test(l)) continue;
      const stripped = l.replace(/\$\{\{.*?\}\}/g, '');
      for (const m of stripped.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) assert.ok(envNames.has(m[1]), `${f}: $${m[1]}`);
    }
  }
});

test('gitlab jobs', () => {
  for (const f of GL) {
    const lines = read(f).split('\n');
    const jobs = [];
    lines.forEach((l, i) => { const m = l.match(/^([A-Za-z_][\w.-]*):\s*$/); if (m) jobs.push({ name: m[1], i }); });
    assert.ok(jobs.length >= 1, f);
    jobs.forEach((j, k) => {
      assert.ok(j.name.startsWith('sync-'), j.name);
      const block = lines.slice(j.i, k + 1 < jobs.length ? jobs[k + 1].i : lines.length).join('\n');
      assert.ok(/^ {2}image: node:22\s*$/m.test(block), `${j.name} image`);
      assert.equal(lines[j.i + 1].trim(), '# SYNC_KIT_RUNNER_TAGS', `${j.name} tags placeholder`);
    });
    for (const m of read(f).matchAll(/\$\{?([A-Z][A-Z0-9_]*)/g)) assert.ok(GL_VARS.has(m[1]), `${f}: ${m[1]}`);
  }
  const chk = read(GL[0]);
  assert.match(chk, /GIT_DEPTH:\s*"0"/);
  assert.ok(chk.includes('- if: $CI_PIPELINE_SOURCE == "merge_request_event"'));
  assert.ok(chk.includes('node sync/scripts/sync.mjs check'));
  assert.ok(chk.includes('node sync/scripts/sync.mjs contract-check --base "$CI_MERGE_REQUEST_DIFF_BASE_SHA" --head HEAD'));
  const n = read(GL[1]);
  assert.ok(n.includes('$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'));
  assert.ok(n.includes('- "sync/**/*"'));
  assert.ok(n.includes('node sync/scripts/sync.mjs notify --before "$CI_COMMIT_BEFORE_SHA" --after "$CI_COMMIT_SHA"'));
  const rem = n.slice(n.indexOf('sync-remind:'));
  assert.ok(rem.includes('- if: $CI_PIPELINE_SOURCE == "schedule" && $SYNC_REMIND == "1"'));
  assert.ok(rem.includes('node sync/scripts/sync.mjs remind'));
});
