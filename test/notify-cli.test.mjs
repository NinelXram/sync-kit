import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { makeTempRepo, gitCommit, GIT_ENV } from './helpers.mjs';

const STRIP = /^(GITHUB_ACTIONS|GITLAB_CI|GITHUB_REPOSITORY|GITHUB_SERVER_URL|CI_PROJECT_URL|TELEGRAM_.*|GCHAT_WEBHOOK_URL)$/;
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...GIT_ENV };
  for (const k of Object.keys(env)) if (STRIP.test(k)) delete env[k];
  return { ...env, ...extra };
}
const run = (root, args, extra) => {
  const r = spawnSync(process.execPath, ['sync/scripts/sync.mjs', ...args], { cwd: root, env: cleanEnv(extra), encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

const cfg = (notify) => JSON.stringify({
  kitVersion: '1.0.0', lang: 'en', topology: 'monorepo', sides: { be: 'BE', fe: 'FE' },
  modules: { billing: 'billing' }, strict: { enabled: true, since: '2020-01-01' },
  notify: { channel: 'none', managers: { be: ['@alice'] }, remindMaxItems: 5, siteUrl: '', ...notify },
});
const NOTE = `---
id: 2026-01-05-fe-add-field
title: Add field <total>
module: billing
from: fe
author: "@bob"
type: feature
priority: high
created: 2026-01-05
refs: [XYZ-FE-003]
targets:
  be: pending
---

body
`;

async function repoWithNote(notify) {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfg(notify), 'a.txt': 'x' });
  gitCommit(r.root, 'one');
  mkdirSync(path.join(r.root, 'sync/billing'), { recursive: true });
  writeFileSync(path.join(r.root, 'sync/billing/2026-01-05-fe-add-field.md'), NOTE);
  gitCommit(r.root, 'two');
  return r;
}

test('notify --dry-run prints plain text and exits 0', async () => {
  const r = await repoWithNote({ channel: 'telegram' });
  try {
    const out = run(r.root, ['notify', '--before', 'HEAD~1', '--after', 'HEAD', '--dry-run'], { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' });
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /FE raised a new sync note for BE/);
    assert.match(out.stdout, /Add field <total>/);
    assert.match(out.stdout, /@alice/);
    assert.match(out.stdout, /sync\/billing\/2026-01-05-fe-add-field\.md/);
    assert.doesNotMatch(out.stdout, /<b>/);
  } finally { await r.cleanup(); }
});

test('notify with zeros before uses after~1; single-commit repo → nothing, exit 0', async () => {
  const r = await repoWithNote({});
  try {
    const out = run(r.root, ['notify', '--before', '0'.repeat(40), '--after', 'HEAD']);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /Add field/);
  } finally { await r.cleanup(); }
  const one = await makeTempRepo({ 'sync/sync.config.json': cfg({}) });
  try {
    gitCommit(one.root, 'one');
    const out = run(one.root, ['notify', '--before', '0'.repeat(40), '--after', 'HEAD']);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /No events to notify/);
  } finally { await one.cleanup(); }
});

test('notify with channel gchat and missing GCHAT_WEBHOOK_URL prints plain + warning naming the env, exits 0', async () => {
  const r = await repoWithNote({ channel: 'gchat' });
  try {
    const out = run(r.root, ['notify', '--before', 'HEAD~1', '--after', 'HEAD']);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /warning: .*GCHAT_WEBHOOK_URL/);
    assert.match(out.stdout, /Add field <total>/);
    assert.doesNotMatch(out.stdout, /@alice/);
  } finally { await r.cleanup(); }
});

test('remind --dry-run prints per-side reminder, exits 0', async () => {
  const r = await repoWithNote({ channel: 'telegram', siteUrl: 'https://dash.example.test' });
  try {
    const out = run(r.root, ['remind', '--dry-run']);
    assert.equal(out.code, 0, out.stderr);
    assert.match(out.stdout, /BE/);
    assert.match(out.stdout, /2026-01-05-fe-add-field/);
    assert.match(out.stdout, /View progress: https:\/\/dash\.example\.test/);
  } finally { await r.cleanup(); }
});
