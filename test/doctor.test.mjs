import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempRepo, GIT_ENV } from './helpers.mjs';
import { doctor } from '../kit/scripts/lib/doctor.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'scripts');
const ENV = { ...process.env, ...GIT_ENV };
const git = (r, args) => spawnSync('git', args, { cwd: r.root, env: ENV, encoding: 'utf8' });

const cfg = (notify = {}) =>
  JSON.stringify({
    kitVersion: '1.0.0',
    lang: 'en',
    topology: 'monorepo',
    sides: { be: 'BE', fe: 'FE' },
    modules: { billing: 'billing' },
    strict: { enabled: true, since: '2020-01-01' },
    notify: { channel: 'none', ...notify },
  });

const HOOK = '#!/bin/sh\nnode sync/scripts/sync.mjs check\n';
const GL_CHECK = 'sync-check:\n  script:\n    - node sync/scripts/sync.mjs check\n';
const GL_NOTIFY = 'sync-notify:\n  script:\n    - node sync/scripts/sync.mjs notify\nsync-remind:\n  script:\n    - node sync/scripts/sync.mjs remind\n';

/** Temp repo set up through phase 02 (state, config, README, CLAUDE.md block). */
async function repo({ ci = 'github', channel = 'none', notify = {}, files = {} } = {}) {
  const r = await makeTempRepo({
    'sync/sync.config.json': cfg({ channel, ...notify }),
    'sync/.kit/discovery.md': '# Discovery\n',
    ...files,
  });
  const run = (args) => { const x = r.run(args); assert.equal(x.code, 0, `${args.join(' ')}\n${x.stdout}${x.stderr}`); };
  run(['state', 'init', '--kit-ref', 'v1.0.0']);
  run(['state', 'decide', '--topology', 'monorepo', '--ci', ci, '--agent-file', 'CLAUDE.md', '--channel', channel, '--lang', 'en']);
  run(['init']);
  const readme = path.join(r.syncDir, 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8').replace(/TODO[^\n]*/, 'Contracts live in api/. Reviewer: @alice.'));
  run(['agent-rules', '--file', 'CLAUDE.md']);
  return r;
}

const doc = (r, phase) => doctor({ syncDir: r.syncDir, repoRoot: r.root, phase });
const byId = (res, id) => res.checks.filter((c) => c.id === id);
const failed = (res) => res.checks.filter((c) => !c.ok).map((c) => `${c.level} ${c.id}: ${c.msg}`);
const write = (r, rel, text) => {
  const f = path.join(r.root, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
};

test('doctor runs from kit path with --sync-dir', async () => {
  const r = await repo();
  try {
    const x = spawnSync(process.execPath, [path.join(KIT, 'sync.mjs'), 'doctor', '--phase', '02', '--sync-dir', 'sync'], { cwd: r.root, env: ENV, encoding: 'utf8' });
    assert.equal(x.status, 0, x.stdout + x.stderr);
    assert.match(x.stdout, /✓/);
  } finally { await r.cleanup(); }
});

test('phase 00 fails without state, and doctor without config does not crash', async () => {
  const r = await makeTempRepo();
  try {
    const res = doc(r, '01');
    assert.equal(res.ok, false);
    assert.equal(byId(res, 'state-valid')[0].ok, false);
    assert.equal(byId(res, 'config-valid')[0].ok, false);
    const x = r.run(['doctor', '--phase', '01']);
    assert.equal(x.code, 1);
    assert.match(x.stdout, /✗/);
    assert.equal(r.run(['doctor', '--phase', '9']).code, 2);
  } finally { await r.cleanup(); }
});

test('phase 01 passes on a fresh install', async () => {
  const r = await repo();
  try {
    const res = doc(r, '01');
    assert.deepEqual(failed(res), []);
    assert.equal(res.ok, true);
  } finally { await r.cleanup(); }
});

test('phase 01 fails when a script file was edited', async () => {
  const r = await repo();
  try {
    const f = path.join(r.syncDir, 'scripts', 'lib', 'notes.mjs');
    const txt = readFileSync(f, 'utf8');
    writeFileSync(f, txt.replace('const SKIP', 'const SKIp').replace('SKIP.has', 'SKIp.has'));
    const res = doc(r, '01');
    assert.equal(res.ok, false);
    const c = byId(res, 'engine-manifest')[0];
    assert.equal(c.ok, false);
    assert.match(c.msg, /lib\/notes\.mjs/);
  } finally { await r.cleanup(); }
});

test('phase 01 fails when project-rules still TODO', async () => {
  const r = await repo();
  try {
    const readme = path.join(r.syncDir, 'README.md');
    writeFileSync(readme, readFileSync(readme, 'utf8').replace('Contracts live in api/. Reviewer: @alice.', 'TODO: write rules'));
    const res = doc(r, '01');
    assert.equal(res.ok, false);
    assert.deepEqual(failed(res).map((s) => s.split(':')[0]), ['error readme-project-rules']);
  } finally { await r.cleanup(); }
});

test('phase 01 fails on version mismatch', async () => {
  const r = await repo();
  try {
    const f = path.join(r.syncDir, 'sync.config.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"1.0.0"', '"0.9.0"'));
    const res = doc(r, '01');
    assert.equal(res.ok, false);
    assert.deepEqual(failed(res).map((s) => s.split(':')[0]), ['error kit-version']);
  } finally { await r.cleanup(); }
});

test('phase 01 fails when check fails', async () => {
  const r = await repo();
  try {
    write(r, 'sync/billing/bad.md', 'no frontmatter\n');
    const res = doc(r, '01');
    assert.equal(byId(res, 'check-passes')[0].ok, false);
  } finally { await r.cleanup(); }
});

test('phase 02 fails when CLAUDE.md lacks block', async () => {
  const r = await repo();
  try {
    assert.equal(doc(r, '02').ok, true);
    write(r, 'CLAUDE.md', '# Project\n');
    const res = doc(r, '02');
    assert.equal(res.ok, false);
    const c = byId(res, 'agent-rules-block')[0];
    assert.equal(c.ok, false);
    assert.match(c.msg, /CLAUDE\.md/);
  } finally { await r.cleanup(); }
});

test('phase 02 skipped with --no-agent-files passes', async () => {
  const r = await repo();
  try {
    assert.equal(r.run(['state', 'decide', '--no-agent-files']).code, 0);
    assert.equal(byId(doc(r, '02'), 'agent-files-decided')[0].ok, false);
    assert.equal(r.run(['state', 'phase', '02', 'skipped']).code, 0);
    const res = doc(r, '02');
    assert.equal(res.ok, true);
    assert.equal(byId(res, 'agent-files-decided')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('phase 03 github passes with workflow', async () => {
  const r = await repo();
  try {
    assert.equal(byId(doc(r, '03'), 'github-check-workflow')[0].ok, false);
    write(r, '.github/workflows/sync-check.yml', 'jobs:\n  check:\n    steps:\n      - run: node sync/scripts/sync.mjs check\n');
    const res = doc(r, '03');
    assert.deepEqual(failed(res), []);
  } finally { await r.cleanup(); }
});

test('phase 03 gitlab passes with sync/ci file + include', async () => {
  for (const line of ["  - local: 'sync/ci/sync-check.gitlab-ci.yml'", '  - local: "/sync/ci/sync-check.gitlab-ci.yml"', "  - 'sync/ci/sync-check.gitlab-ci.yml'", '  - sync/ci/sync-check.gitlab-ci.yml']) {
    const r = await repo({ ci: 'gitlab', files: { 'sync/ci/sync-check.gitlab-ci.yml': GL_CHECK, '.gitlab-ci.yml': `include:\n${line}\n` } });
    try {
      const res = doc(r, '03');
      assert.deepEqual(failed(res), [], line);
    } finally { await r.cleanup(); }
  }
});

test('phase 03 gitlab fails when .gitlab-ci.yml lacks include', async () => {
  const r = await repo({ ci: 'gitlab', files: { 'sync/ci/sync-check.gitlab-ci.yml': GL_CHECK, '.gitlab-ci.yml': "include:\n  # - local: 'sync/ci/sync-check.gitlab-ci.yml'\n  - local: 'ci/other.yml'\n" } });
  try {
    const res = doc(r, '03');
    assert.equal(res.ok, false);
    assert.deepEqual(failed(res).map((s) => s.split(':')[0]), ['error gitlab-check-include']);
  } finally { await r.cleanup(); }
});

test('phase 03 gitlab warns when workflow rules omit merge_request_event', async () => {
  const gl = "workflow:\n  rules:\n    - if: $CI_COMMIT_BRANCH == 'main'\ninclude:\n  - local: sync/ci/sync-check.gitlab-ci.yml\n";
  const r = await repo({ ci: 'gitlab', files: { 'sync/ci/sync-check.gitlab-ci.yml': GL_CHECK, '.gitlab-ci.yml': gl } });
  try {
    const res = doc(r, '03');
    assert.equal(res.ok, true);
    const c = byId(res, 'gitlab-workflow-mr')[0];
    assert.equal(c.ok, false);
    assert.equal(c.level, 'warn');
    write(r, '.gitlab-ci.yml', gl.replace("== 'main'", "== 'main'\n    - if: $CI_PIPELINE_SOURCE == 'merge_request_event'"));
    assert.equal(byId(doc(r, '03'), 'gitlab-workflow-mr')[0].ok, true);
  } finally { await r.cleanup(); }
});

function addHook(r, exec = true) {
  write(r, 'sync/hooks/pre-commit', HOOK);
  git(r, ['add', 'sync/hooks/pre-commit']);
  if (exec) git(r, ['update-index', '--chmod=+x', 'sync/hooks/pre-commit']);
}

test('phase 03 none: missing sync/hooks/pre-commit fails, hook not activated only warns', async () => {
  const r = await repo({ ci: 'none' });
  try {
    let res = doc(r, '03');
    assert.equal(res.ok, false);
    assert.equal(byId(res, 'hook-file')[0].ok, false);
    addHook(r);
    res = doc(r, '03');
    assert.equal(res.ok, true, failed(res).join('\n'));
    const act = byId(res, 'hook-activated')[0];
    assert.equal(act.ok, false);
    assert.equal(act.level, 'warn');
    git(r, ['config', 'core.hooksPath', 'sync/hooks']);
    assert.deepEqual(failed(doc(r, '03')), []);
  } finally { await r.cleanup(); }
});

test('phase 03 none: husky config counts as activated', async () => {
  const r = await repo({ ci: 'none' });
  try {
    addHook(r);
    write(r, '.husky/pre-commit', 'sh sync/hooks/pre-commit\n');
    assert.equal(byId(doc(r, '03'), 'hook-activated')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('phase 03 none: hook tracked as 100644 fails', async () => {
  const r = await repo({ ci: 'none' });
  try {
    addHook(r, false);
    const res = doc(r, '03');
    assert.equal(res.ok, false);
    const c = byId(res, 'hook-executable')[0];
    assert.equal(c.ok, false);
    assert.match(c.msg, /100644/);
  } finally { await r.cleanup(); }
});

test('phase 03 none: committed as 100644 fails even if index says 100755', async () => {
  const r = await repo({ ci: 'none' });
  try {
    addHook(r, false);
    assert.equal(git(r, ['commit', '-q', '-m', 'hook']).status, 0);
    git(r, ['update-index', '--chmod=+x', 'sync/hooks/pre-commit']);
    assert.match(git(r, ['ls-files', '-s', 'sync/hooks/pre-commit']).stdout, /^100755/);
    const c = byId(doc(r, '03'), 'hook-executable')[0];
    assert.equal(c.ok, false);
    assert.match(c.msg, /100644/);
    assert.equal(git(r, ['commit', '-q', '-m', 'exec']).status, 0);
    assert.equal(byId(doc(r, '03'), 'hook-executable')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('phase 03 none: committed as 100755 passes', async () => {
  const r = await repo({ ci: 'none' });
  try {
    addHook(r);
    assert.equal(git(r, ['commit', '-q', '-m', 'hook']).status, 0);
    assert.match(git(r, ['ls-tree', 'HEAD', '--', 'sync/hooks/pre-commit']).stdout, /^100755/);
    assert.equal(byId(doc(r, '03'), 'hook-executable')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('phase 03 none: hooksPath shadows existing .git/hooks/pre-push → warn', async () => {
  const r = await repo({ ci: 'none' });
  try {
    addHook(r);
    git(r, ['config', 'core.hooksPath', 'sync/hooks']);
    write(r, '.git/hooks/pre-push', '#!/bin/sh\nexit 0\n');
    const res = doc(r, '03');
    assert.equal(res.ok, true);
    const c = byId(res, 'hooks-shadowed')[0];
    assert.equal(c.ok, false);
    assert.equal(c.level, 'warn');
    assert.match(c.msg, /pre-push/);
    assert.doesNotMatch(c.msg, /\.sample/);
  } finally { await r.cleanup(); }
});

const GH_FILES = {
  '.github/workflows/sync-check.yml': 'run: node sync/scripts/sync.mjs check\n',
  '.github/workflows/sync-notify.yml': 'run: node sync/scripts/sync.mjs notify\n',
  '.github/workflows/sync-reminder.yml': 'run: node sync/scripts/sync.mjs remind\n',
};

test('phase 04 telegram fails when active side has no manager', async () => {
  const r = await repo({ channel: 'telegram', notify: { managers: { be: ['@alice'] } }, files: GH_FILES });
  try {
    const res = doc(r, '04');
    assert.equal(res.ok, false);
    const c = byId(res, 'telegram-managers')[0];
    assert.equal(c.ok, false);
    assert.match(c.msg, /fe/);
  } finally { await r.cleanup(); }
});

test('phase 04 gchat passes without managers', async () => {
  const r = await repo({ channel: 'gchat', files: GH_FILES });
  try {
    const res = doc(r, '04');
    assert.deepEqual(failed(res), []);
    assert.equal(byId(res, 'gitlab-schedule-manual').length, 0);
  } finally { await r.cleanup(); }
});

test('phase 04 fails when channel differs between config and state', async () => {
  const r = await repo({ channel: 'gchat', files: GH_FILES });
  try {
    const f = path.join(r.syncDir, 'sync.config.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"gchat"', '"none"'));
    assert.equal(byId(doc(r, '04'), 'channel-consistent')[0].ok, false);
  } finally { await r.cleanup(); }
});

test('phase 04 gitlab fails without sync-notify include, always warns schedule-manual', async () => {
  const files = {
    'sync/ci/sync-check.gitlab-ci.yml': GL_CHECK,
    'sync/ci/sync-notify.gitlab-ci.yml': GL_NOTIFY,
    '.gitlab-ci.yml': "include:\n  - local: 'sync/ci/sync-check.gitlab-ci.yml'\n",
  };
  const r = await repo({ ci: 'gitlab', channel: 'gchat', files });
  try {
    let res = doc(r, '04');
    assert.equal(res.ok, false);
    assert.deepEqual(failed(res).map((s) => s.split(':')[0]), ['error gitlab-notify-include', 'warn gitlab-schedule-manual']);
    write(r, '.gitlab-ci.yml', `${files['.gitlab-ci.yml']}  - local: 'sync/ci/sync-notify.gitlab-ci.yml'\n`);
    res = doc(r, '04');
    assert.equal(res.ok, true);
    const c = byId(res, 'gitlab-schedule-manual')[0];
    assert.equal(c.ok, false);
    assert.equal(c.level, 'warn');
    assert.match(c.msg, /SYNC_REMIND=1/);
  } finally { await r.cleanup(); }
});

test('phase 05 requires at least one note', async () => {
  const r = await repo({ files: GH_FILES });
  try {
    assert.equal(byId(doc(r, '05'), 'notes-exist')[0].ok, false);
    const x = r.run(['new', '--module', 'billing', '--from', 'be', '--to', 'fe', '--type', 'feature', '--slug', 'add-invoice', '--title', 'Add invoice', '--author', '@alice']);
    assert.equal(x.code, 0, x.stderr);
    assert.equal(byId(doc(r, '05'), 'notes-exist')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('no --phase runs phases recorded in state', async () => {
  const r = await repo();
  try {
    assert.ok(byId(doc(r), 'state-valid').length);
    assert.equal(byId(doc(r), 'config-valid').length, 0);
    assert.equal(r.run(['state', 'phase', '01', 'done']).code, 0);
    assert.equal(byId(doc(r), 'config-valid').length, 1);
  } finally { await r.cleanup(); }
});

test('01 skipped + --phase 05 still fails on an edited engine file', async () => {
  const r = await repo({ files: GH_FILES });
  try {
    assert.equal(r.run(['state', 'phase', '01', 'skipped']).code, 0);
    const f = path.join(r.syncDir, 'scripts', 'lib', 'notes.mjs');
    writeFileSync(f, `${readFileSync(f, 'utf8')}// rewritten\n`);
    for (const res of [doc(r, '05'), doc(r)]) {
      assert.equal(res.ok, false);
      assert.equal(byId(res, 'engine-manifest')[0].ok, false);
      assert.equal(byId(res, 'kit-version').length, 1);
      assert.equal(byId(res, 'check-passes').length, 1);
    }
  } finally { await r.cleanup(); }
});

test('04 skipped with ci none/channel none passes doctor --phase 05', async () => {
  const r = await repo({ ci: 'none', channel: 'none' });
  try {
    addHook(r);
    git(r, ['config', 'core.hooksPath', 'sync/hooks']);
    const x = r.run(['new', '--module', 'billing', '--from', 'be', '--to', 'fe', '--type', 'feature', '--slug', 'add-invoice', '--title', 'Add invoice', '--author', '@alice']);
    assert.equal(x.code, 0, x.stderr);
    assert.equal(r.run(['inbox']).code, 0);
    for (const p of ['00', '01', '02', '03']) assert.equal(r.run(['state', 'phase', p, 'done']).code, 0);
    assert.equal(r.run(['state', 'phase', '04', 'skipped']).code, 0);
    assert.equal(r.run(['state', 'phase', '05', 'done']).code, 0);
    for (const res of [doc(r, '05'), doc(r)]) {
      assert.deepEqual(failed(res), []);
      assert.equal(byId(res, 'channel-consistent')[0].ok, true);
    }
  } finally { await r.cleanup(); }
});

test('02 skipped with no agent files passes; done with none fails', async () => {
  const r = await makeTempRepo({ 'sync/sync.config.json': cfg(), 'sync/.kit/discovery.md': '# Discovery\n' });
  try {
    assert.equal(r.run(['state', 'init', '--kit-ref', 'v1.0.0']).code, 0);
    assert.equal(r.run(['state', 'phase', '02', 'done']).code, 0);
    assert.equal(byId(doc(r, '02'), 'agent-files-decided')[0].ok, false);
    assert.equal(r.run(['state', 'phase', '02', 'skipped']).code, 0);
    assert.equal(byId(doc(r, '02'), 'agent-files-decided')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('--json prints {ok, checks}', async () => {
  const r = await repo();
  try {
    const x = r.run(['doctor', '--phase', '01', '--json']);
    assert.equal(x.code, 0, x.stdout);
    const out = JSON.parse(x.stdout);
    assert.deepEqual(Object.keys(out), ['ok', 'checks']);
    assert.equal(out.ok, true);
    assert.ok(out.checks.every((c) => typeof c.id === 'string' && typeof c.ok === 'boolean' && ['error', 'warn'].includes(c.level) && typeof c.msg === 'string'));
  } finally { await r.cleanup(); }
});

test('phase 03 github fails while sync-check.yml still has __DEFAULT_BRANCH__', async () => {
  const r = await repo();
  try {
    write(r, '.github/workflows/sync-check.yml', 'on:\n  push:\n    branches: [__DEFAULT_BRANCH__]\n# node sync/scripts/sync.mjs check\n');
    const c = byId(doc(r, '03'), 'github-check-branch')[0];
    assert.equal(c.ok, false);
    assert.equal(c.level, 'error');
    assert.match(c.msg, /__DEFAULT_BRANCH__/);
  } finally { await r.cleanup(); }
});

test('phase 04 github fails on unreplaced __DEFAULT_BRANCH__ and on a cron marker without a cron line', async () => {
  const files = {
    ...GH_FILES,
    '.github/workflows/sync-notify.yml': 'on:\n  push:\n    branches: [__DEFAULT_BRANCH__]\n# node sync/scripts/sync.mjs notify\n',
    '.github/workflows/sync-reminder.yml': 'on:\n  schedule:\n    # SYNC_KIT_CRON\n\n  workflow_dispatch:\n',
  };
  const r = await repo({ channel: 'gchat', files });
  try {
    let res = doc(r, '04');
    assert.equal(res.ok, false);
    assert.deepEqual(failed(res).map((s) => s.split(':')[0]), ['error github-notify-branch', 'error github-reminder-cron']);
    write(r, '.github/workflows/sync-notify.yml', 'on:\n  push:\n    branches: [main]\n');
    write(r, '.github/workflows/sync-reminder.yml', "on:\n  schedule:\n    # SYNC_KIT_CRON\n\n    - cron: '0 1 * * 1-5'\n");
    res = doc(r, '04');
    assert.deepEqual(failed(res), []);
    assert.equal(byId(res, 'github-notify-branch')[0].ok, true);
    assert.equal(byId(res, 'github-reminder-cron')[0].ok, true);
  } finally { await r.cleanup(); }
});

test('phase 04 vi messages for the new github checks', async () => {
  const r = await repo({ channel: 'gchat', files: GH_FILES });
  try {
    const f = path.join(r.syncDir, 'sync.config.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('"lang":"en"', '"lang":"vi"'));
    const res = doc(r, '04');
    assert.ok(byId(res, 'github-notify-branch')[0].msg.length > 0);
    assert.ok(byId(res, 'github-reminder-cron')[0].msg.length > 0);
  } finally { await r.cleanup(); }
});

test('kit sync-reminder.yml template satisfies the cron marker check', async () => {
  const { cronAfterMarker } = await import('../kit/scripts/lib/doctor.mjs');
  const tpl = readFileSync(path.resolve(KIT, '..', 'ci', 'github', 'sync-reminder.yml'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(cronAfterMarker(tpl), true);
  assert.equal(cronAfterMarker(tpl.replace(/^\s*- cron:.*$/m, '')), false);
});
