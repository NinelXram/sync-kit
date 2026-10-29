#!/usr/bin/env node
// Deterministic end-to-end run of the engine CLI against the fixture repos in test/fixtures/repos/.
// For each fixture: copy to a temp dir, git init + commit, install the engine from kit/, drive phases 00-02
// (03-04 for GitLab) through the CLI exactly as an AI agent following prompts/ would, and assert exit codes/output.
// Usage: node scripts/e2e.mjs [--verbose] [fixture ...]   Exit 1 if any fixture fails.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ENV } from '../test/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'repos');
const KIT_SYNC = path.join(ROOT, 'kit', 'scripts', 'sync.mjs');
const KIT_GITLAB = path.join(ROOT, 'kit', 'ci', 'gitlab');
const KIT_REF = `v${readFileSync(path.join(ROOT, 'kit', 'scripts', 'VERSION'), 'utf8').trim()}`;
const RULES_START = '<!-- sync-kit:project-rules:start -->';
const RULES_END = '<!-- sync-kit:project-rules:end -->';

// Results must not depend on the CI runner executing this script (or on a developer's secrets).
const STRIP = ['GITHUB_ACTIONS', 'GITLAB_CI', 'GITHUB_REPOSITORY', 'GITHUB_SERVER_URL', 'CI_PROJECT_URL', 'GCHAT_WEBHOOK_URL'];
const ENV = { ...process.env, ...GIT_ENV };
for (const k of Object.keys(ENV)) if (STRIP.includes(k) || k.startsWith('TELEGRAM_')) delete ENV[k];

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const lines = (s) => s.split(/\r?\n/);

class StepError extends Error {}

function runner(dir) {
  const log = [];
  const exec = (label, bin, args) => {
    const r = spawnSync(bin, args, { cwd: dir, env: ENV, encoding: 'utf8' });
    const res = { label, code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error) : '') };
    log.push(res);
    return res;
  };
  const fail = (res, why) => {
    throw new StepError(`${res.label}: ${why}\n--- exit ${res.code}\n--- stdout\n${res.stdout}--- stderr\n${res.stderr}`);
  };
  const ok = (res, expect = 0) => { if (res.code !== expect) fail(res, `expected exit ${expect}`); return res; };
  return {
    log,
    fail,
    git: (...args) => ok(exec(`git ${args.join(' ')}`, 'git', args)),
    kit: (...args) => ok(exec(`[kit] ${args[0]}`, process.execPath, [KIT_SYNC, ...args])),
    sync: (...args) => ok(exec(`sync ${args.join(' ')}`, process.execPath, ['sync/scripts/sync.mjs', ...args])),
    commit: (msg) => {
      ok(exec('git add -A', 'git', ['add', '-A']));
      return ok(exec(`git commit (${msg})`, 'git', ['commit', '-q', '-m', msg]));
    },
  };
}

function edit(file, fn) {
  writeFileSync(file, fn(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));
}

/** Phases 03 + 04 for GitLab, done the way prompts/03-ci.md and 04-notify.md tell the AI to. */
function gitlabCiSetup(dir) {
  const ciDir = path.join(dir, 'sync', 'ci');
  mkdirSync(ciDir, { recursive: true });
  const files = ['sync-check.gitlab-ci.yml', 'sync-notify.gitlab-ci.yml'];
  for (const f of files) {
    const text = readFileSync(path.join(KIT_GITLAB, f), 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(path.join(ciDir, f), text.split('\n').filter((l) => !/^\s*# SYNC_KIT_RUNNER_TAGS\s*$/.test(l)).join('\n'));
  }
  edit(path.join(dir, '.gitlab-ci.yml'), (t) =>
    `include:\n${files.map((f) => `  - local: 'sync/ci/${f}'\n`).join('')}\n${t}`);
}

async function runFixture(name) {
  const src = path.join(FIXTURES, name);
  const expected = path.join(src, 'expected');
  const decisions = readJson(path.join(expected, 'decisions.json'));
  const scenario = readJson(path.join(expected, 'scenario.json'));
  const tmp = mkdtempSync(path.join(tmpdir(), `sync-kit-e2e-${name}-`));
  const dir = path.join(tmp, 'repo');
  const r = runner(dir);
  try {
    cpSync(src, dir, { recursive: true, filter: (p) => path.resolve(p) !== path.resolve(expected) });
    r.git('init', '-q');
    r.commit('initial');

    // phase 00 — state + decisions + discovery (written by the AI)
    r.kit('install', '--sync-dir', path.join(dir, 'sync'));
    r.sync('state', 'init', '--kit-ref', KIT_REF);
    const decide = ['state', 'decide', '--topology', decisions.topology, '--ci', decisions.ci,
      '--channel', decisions.channel, '--lang', decisions.lang];
    if (decisions.agentFiles.length) for (const f of decisions.agentFiles) decide.push('--agent-file', f);
    else decide.push('--no-agent-files');
    r.sync(...decide);
    writeFileSync(path.join(dir, 'sync', '.kit', 'discovery.md'), `# Discovery\n\ne2e fixture \`${name}\`.\n`);
    r.sync('state', 'phase', '00', 'done');

    // phase 01 — config (the AI's decision), init, project rules, first note, inbox, check
    cpSync(path.join(expected, 'sync.config.json'), path.join(dir, 'sync', 'sync.config.json'));
    r.sync('init');
    edit(path.join(dir, 'sync', 'README.md'), (t) => {
      const a = t.indexOf(RULES_START);
      const b = t.indexOf(RULES_END);
      if (a === -1 || b < a) throw new StepError('sync/README.md: project-rules markers missing after init');
      return `${t.slice(0, a + RULES_START.length)}\n- Contract files: see \`contract.globs\` in sync.config.json.\n- Every contract change ships with a note in the same PR.\n${t.slice(b)}`;
    });
    r.sync('new', ...scenario.new);
    r.sync('inbox');
    const check = r.sync('check');
    r.sync('state', 'phase', '01', 'done');

    // phase 02 — agent rules
    for (const f of decisions.agentFiles) r.sync('agent-rules', '--file', f);
    r.sync('state', 'phase', '02', decisions.agentFiles.length ? 'done' : 'skipped');

    if (decisions.ci === 'gitlab') {
      gitlabCiSetup(dir);
      r.sync('state', 'phase', '03', 'done');
      r.sync('state', 'phase', '04', decisions.channel === 'none' ? 'skipped' : 'done');
    }
    r.commit('chore(sync): install sync-kit');

    r.sync('contract-check', '--base', 'HEAD');
    r.sync('doctor', '--phase', '02');

    // re-running the write commands must not change anything
    r.sync('init');
    for (const f of decisions.agentFiles) r.sync('agent-rules', '--file', f);
    const st = r.git('status', '--porcelain');
    if (st.stdout.trim()) r.fail(st, 'init/agent-rules re-run changed files');

    if (name === 'monorepo-node') {
      edit(path.join(dir, 'apps', 'api', 'src', 'billing', 'dto', 'create-invoice.dto.ts'),
        (t) => t.replace('amount!: number;', 'amount!: number;\n  dueDate?: string;'));
      r.commit('feat(api): invoice due date without note');
      const cc = r.sync('contract-check', '--base', 'HEAD~1', '--head', 'HEAD');
      if (!lines(cc.stdout).some((l) => l.startsWith('warning:'))) r.fail(cc, 'expected a line starting with "warning:"');
    }

    if (name === 'legacy') {
      const out = lines(check.stdout);
      if (out.some((l) => l.startsWith('error:'))) r.fail(check, 'legacy notes must not produce "error:" lines');
      if (!out.some((l) => l.startsWith('warning:'))) r.fail(check, 'expected a warning for the free-form status');
    }

    if (decisions.ci === 'gitlab') {
      const d = r.sync('doctor', '--phase', '04', '--json');
      const res = JSON.parse(d.stdout);
      const warns = res.checks.filter((c) => !c.ok && c.level === 'warn').map((c) => c.id);
      if (!res.ok) r.fail(d, 'doctor not ok');
      if (warns.join(',') !== 'gitlab-schedule-manual') r.fail(d, `expected exactly one warn "gitlab-schedule-manual", got [${warns}]`);
      const n = r.sync('notify', '--before', 'HEAD~1', '--after', 'HEAD', '--dry-run');
      const title = scenario.new[scenario.new.indexOf('--title') + 1];
      if (!n.stdout.includes(title)) r.fail(n, `dry-run output should mention the new note "${title}"`);
    }
    return { name, ok: true, steps: r.log.length };
  } catch (e) {
    return { name, ok: false, steps: r.log.length, error: e instanceof StepError ? e.message : e.stack };
  } finally {
    if (VERBOSE) for (const s of r.log) console.log(`[${name}] ${s.label} -> exit ${s.code}\n${s.stdout}${s.stderr}`);
    rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
}

const VERBOSE = process.argv.includes('--verbose');
const wanted = process.argv.slice(2).filter((a) => a !== '--verbose');
const names = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(path.join(FIXTURES, e.name, 'expected', 'decisions.json')))
  .map((e) => e.name)
  .filter((n) => !wanted.length || wanted.includes(n))
  .sort();
if (!names.length) {
  console.error(`no fixtures found${wanted.length ? ` matching: ${wanted.join(', ')}` : ''}`);
  process.exit(2);
}

const results = [];
for (const n of names) {
  const res = await runFixture(n);
  results.push(res);
  if (!res.ok) console.error(`\n[${n}] FAILED\n${res.error}\n`);
}

const w = Math.max(...names.map((n) => n.length), 'fixture'.length);
console.log(`\n| ${'fixture'.padEnd(w)} | result | steps |`);
console.log(`| ${'-'.repeat(w)} | ------ | ----- |`);
for (const r of results) console.log(`| ${r.name.padEnd(w)} | ${(r.ok ? 'PASS' : 'FAIL').padEnd(6)} | ${String(r.steps).padStart(5)} |`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
