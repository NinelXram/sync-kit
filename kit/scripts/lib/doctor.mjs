import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText } from './io.mjs';
import { t } from './i18n.mjs';
import { loadConfig, noteDirs } from './config.mjs';
import { loadState, validateState, PHASES } from './state.mjs';
import { verifyManifest } from './install.mjs';
import { listNoteFiles } from './notes.mjs';
import { START as AGENT_START, END as AGENT_END } from './agentRules.mjs';
import { GEN_START, GEN_END, RULES_START, RULES_END } from './readme.mjs';
import { runCheck } from './commands/check.mjs';

const posix = (p) => p.replaceAll('\\', '/');
const read = (f) => (existsSync(f) && statSync(f).isFile() ? readText(f) : null);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function between(text, start, end) {
  const a = text.indexOf(start);
  const b = a === -1 ? -1 : text.indexOf(end, a + start.length);
  return b === -1 ? null : text.slice(a + start.length, b);
}

/** String-based: `- local: 'x'`, `- local: "/x"`, `- 'x'`, `- x`, `include: x`. Commented lines never match. */
export function includesFile(ciText, file) {
  const re = new RegExp(`^[ \\t]*(?:-[ \\t]*)?(?:(?:include|local)[ \\t]*:[ \\t]*)?['"]?/?${reEsc(file)}['"]?[ \\t]*(?:#.*)?$`, 'm');
  return re.test(ciText);
}

const PLACEHOLDER_BRANCH = '__DEFAULT_BRANCH__';

/** `# SYNC_KIT_CRON` must be followed (next non-empty line) by a `- cron:` entry; no marker = nothing to check. */
export function cronAfterMarker(text) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim() === '# SYNC_KIT_CRON');
  if (i === -1) return true;
  const next = lines.slice(i + 1).find((l) => l.trim() !== '');
  return next !== undefined && /^[ \t]*-[ \t]*cron[ \t]*:/.test(next);
}

function git(repoRoot, args) {
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Verify the installation phase by phase.
 * `phase` "NN" runs every phase <= NN regardless of recorded status;
 * no phase runs 00 plus every phase present in state (done or skipped).
 * Skipped phases must still pass in their "off" configuration (e.g. channel "none", no agent files).
 */
export function doctor({ syncDir, repoRoot, phase }) {
  const checks = [];
  const rel = (abs) => posix(relative(repoRoot, abs));

  let state = null;
  let stateErrors = [];
  try {
    state = loadState(syncDir);
    if (state) stateErrors = validateState(state);
  } catch (e) { stateErrors = e.errors ?? [e.message]; }
  let config = null;
  let configErrors = [];
  try { config = loadConfig(syncDir); } catch (e) { configErrors = e.errors ?? [e.message]; }

  const lang = config?.lang ?? (['en', 'vi'].includes(state?.decisions?.lang) ? state.decisions.lang : 'en');
  const L = (key, vars) => t(lang, key, vars);
  const add = (id, ok, msg, { level = 'error', detail } = {}) =>
    checks.push({ id, ok: Boolean(ok), level, msg: !ok && detail ? `${msg} — ${detail}` : msg });

  const statePhases = state && typeof state.phases === 'object' && state.phases ? state.phases : {};
  const decisions = state && typeof state.decisions === 'object' && state.decisions ? state.decisions : {};
  const phases = phase
    ? PHASES.filter((p) => p <= phase)
    : PHASES.filter((p) => p === '00' || Object.hasOwn(statePhases, p));

  let configReported = false;
  const needConfig = () => {
    if (!configReported) {
      add('config-valid', config, L('doctor.configValid'), { detail: configErrors.join('; ') });
      configReported = true;
    }
    return config;
  };
  let ciReported = false;
  const needCi = () => {
    const ci = decisions.ci;
    if (['github', 'gitlab', 'none'].includes(ci)) return ci;
    if (!ciReported) add('ci-decided', false, L('doctor.ciDecided'));
    ciReported = true;
    return null;
  };
  const fileRuns = (id, file, cmds) => {
    const text = read(join(repoRoot, file));
    const ok = text !== null && cmds.every((c) => text.includes(c));
    add(id, ok, L('doctor.fileRuns', { file, cmd: cmds.join('`, `') }));
  };
  const gitlabCi = () => read(join(repoRoot, '.gitlab-ci.yml')) ?? '';
  const ciDir = rel(join(syncDir, 'ci'));

  const PHASE_CHECKS = {
    '00': () => {
      add('state-valid', state && !stateErrors.length, L('doctor.stateValid'), {
        detail: state ? stateErrors.join('; ') : L('doctor.stateMissing'),
      });
      add('discovery-exists', existsSync(join(syncDir, '.kit', 'discovery.md')), L('doctor.discovery'));
    },
    '01': () => {
      needConfig();
      const scripts = join(syncDir, 'scripts');
      const problems = verifyManifest(scripts);
      add('engine-manifest', !problems.length, L('doctor.engineManifest'), { detail: problems.join(', ') });
      if (!config) return;
      const version = (read(join(scripts, 'VERSION')) ?? '?').trim();
      const sv = state?.kitVersion ?? '?';
      add('kit-version', version === config.kitVersion && version === sv,
        L('doctor.kitVersion', { version, config: config.kitVersion, state: sv }));
      const missing = noteDirs(config).filter((d) => !existsSync(join(syncDir, d)));
      add('note-dirs', !missing.length, L('doctor.noteDirs'), { detail: missing.join(', ') });
      const readme = read(join(syncDir, 'README.md')) ?? '';
      const rules = between(readme, RULES_START, RULES_END);
      add('readme-markers', between(readme, GEN_START, GEN_END) !== null && rules !== null, L('doctor.readmeMarkers'));
      add('readme-project-rules', rules !== null && !/^[ \t]*TODO\b/m.test(rules), L('doctor.projectRules'));
      const res = runCheck({ syncDir, repoRoot, config });
      add('check-passes', !res.errors.length, L('doctor.checkPasses'), {
        detail: res.errors.slice(0, 3).map((e) => `${e.file}: ${e.msg}`).join('; '),
      });
    },
    '02': () => {
      const files = Array.isArray(decisions.agentFiles) ? decisions.agentFiles : [];
      // no agent files is only acceptable when phase 02 was explicitly skipped
      if (!files.length) { add('agent-files-decided', statePhases['02']?.status === 'skipped', L('doctor.agentFilesDecided')); return; }
      for (const f of files) {
        const text = read(resolve(repoRoot, f)) ?? '';
        const s = text.indexOf(AGENT_START);
        add('agent-rules-block', s !== -1 && text.indexOf(AGENT_END, s) !== -1, L('doctor.agentBlock', { file: f }));
      }
    },
    '03': () => {
      const ci = needCi();
      if (ci === 'github') {
        const file = '.github/workflows/sync-check.yml';
        fileRuns('github-check-workflow', file, ['sync.mjs check']);
        add('github-check-branch', !(read(join(repoRoot, file)) ?? '').includes(PLACEHOLDER_BRANCH),
          L('doctor.placeholderReplaced', { file, placeholder: PLACEHOLDER_BRANCH }));
      }
      if (ci === 'gitlab') {
        const file = `${ciDir}/sync-check.gitlab-ci.yml`;
        fileRuns('gitlab-check-file', file, ['sync.mjs check']);
        const text = gitlabCi();
        add('gitlab-check-include', includesFile(text, file), L('doctor.gitlabInclude', { file }));
        const blocked = /^workflow[ \t]*:/m.test(text) && !text.includes('merge_request_event');
        add('gitlab-workflow-mr', !blocked, L('doctor.gitlabWorkflowMr'), { level: 'warn', detail: L('doctor.gitlabWorkflowMrFail') });
      }
      if (ci === 'none') {
        const hooksDir = join(syncDir, 'hooks');
        const hook = `${rel(hooksDir)}/pre-commit`;
        fileRuns('hook-file', hook, ['sync.mjs check']);
        // once committed, the HEAD tree is what other clones get; before that, the index
        const ls = git(repoRoot, ['ls-tree', 'HEAD', '--', hook]) || git(repoRoot, ['ls-files', '-s', '--', hook]);
        const mode = ls ? ls.split(/\s+/)[0] : null;
        add('hook-executable', mode === '100755', L('doctor.hookExecutable', { file: hook }), {
          detail: mode ? L('doctor.hookMode', { mode, file: hook }) : L('doctor.hookUntracked', { file: hook }),
        });
        const hp = git(repoRoot, ['config', 'core.hooksPath']);
        const viaHooksPath = Boolean(hp) && resolve(repoRoot, hp) === resolve(hooksDir);
        let shadowed = [];
        if (viaHooksPath) {
          const common = git(repoRoot, ['rev-parse', '--git-common-dir']);
          const gitHooks = common ? join(resolve(repoRoot, common), 'hooks') : null;
          if (gitHooks && existsSync(gitHooks)) {
            shadowed = readdirSync(gitHooks).filter((f) => !f.endsWith('.sample') && statSync(join(gitHooks, f)).isFile()).sort();
          }
        }
        add('hooks-shadowed', !shadowed.length, L('doctor.hooksShadowed', { dir: rel(hooksDir) }), {
          level: 'warn', detail: L('doctor.hooksShadowedFail', { hooks: shadowed.join(', ') }),
        });
        const managers = ['.husky/pre-commit', 'lefthook.yml', 'lefthook.yaml', '.lefthook.yml', '.pre-commit-config.yaml'];
        const viaManager = managers.some((f) => {
          const text = read(join(repoRoot, f));
          return text !== null && (text.includes('sync.mjs check') || text.includes(hook));
        });
        add('hook-activated', viaHooksPath || viaManager, L('doctor.hookActivated'), {
          level: 'warn', detail: L('doctor.hookActivatedFail', { dir: rel(hooksDir) }),
        });
      }
    },
    '04': () => {
      const ci = needCi();
      const cfg = needConfig();
      const channel = decisions.channel;
      add('channel-consistent', cfg && channel === cfg.notify.channel,
        L('doctor.channelConsistent', { state: channel ?? '?', config: cfg?.notify.channel ?? '?' }));
      if (cfg && channel === 'telegram') {
        const missing = Object.keys(cfg.sides).filter((s) => !cfg.paused.includes(s) && !(cfg.notify.managers[s] ?? []).length);
        add('telegram-managers', !missing.length, L('doctor.telegramManagers'), { detail: missing.join(', ') });
      }
      if (channel && channel !== 'none' && ci === 'github') {
        const files = ['.github/workflows/sync-notify.yml', '.github/workflows/sync-reminder.yml'];
        const missing = files.filter((f) => !existsSync(join(repoRoot, f)));
        add('github-notify-workflows', !missing.length, L('doctor.filesExist', { files: files.join(', ') }), { detail: missing.join(', ') });
        add('github-notify-branch', !(read(join(repoRoot, files[0])) ?? '').includes(PLACEHOLDER_BRANCH),
          L('doctor.placeholderReplaced', { file: files[0], placeholder: PLACEHOLDER_BRANCH }));
        add('github-reminder-cron', cronAfterMarker(read(join(repoRoot, files[1])) ?? ''), L('doctor.reminderCron', { file: files[1] }));
      }
      if (channel && channel !== 'none' && ci === 'gitlab') {
        const file = `${ciDir}/sync-notify.gitlab-ci.yml`;
        fileRuns('gitlab-notify-file', file, ['sync.mjs notify', 'sync.mjs remind']);
        add('gitlab-notify-include', includesFile(gitlabCi(), file), L('doctor.gitlabInclude', { file }));
      }
      if (ci === 'gitlab') add('gitlab-schedule-manual', false, L('doctor.gitlabScheduleManual'), { level: 'warn' });
    },
    '05': () => {
      const cfg = needConfig();
      if (!cfg) return;
      const n = listNoteFiles(syncDir, cfg).length;
      add('notes-exist', n > 0, L('doctor.notesExist', { n }));
    },
  };

  for (const p of phases) PHASE_CHECKS[p]();
  return { ok: checks.every((c) => c.ok || c.level !== 'error'), checks };
}
