import { join } from 'node:path';
import { normalizeText } from './io.mjs';
import { parseFrontmatter, splitFrontmatter } from './frontmatter.mjs';
import { noteDirs } from './config.mjs';
import { OPEN_STATUSES, DONE_STATUSES } from './constants.mjs';
import { validateNote, isClosed, byUrgency } from './notes.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const allDone = (targets) => Object.values(targets).length > 0 && Object.values(targets).every((s) => DONE_STATUSES.includes(s));

/** Note files directly inside <syncPrefix>/<noteDir>/ (README/_TEMPLATE excluded). */
function isNotePath(p, config, syncPrefix) {
  if (!p.endsWith('.md')) return false;
  const slash = p.lastIndexOf('/');
  const base = p.slice(slash + 1);
  if (base === 'README.md' || base === '_TEMPLATE.md') return false;
  const dir = p.slice(0, slash + 1);
  return noteDirs(config).some((d) => `${syncPrefix}/${d}/`.replace(/\/+/g, '/') === dir);
}

/**
 * Note events between two commits. `git(args) => stdout` (throws on failure) is injected.
 * `before` empty / all zeros (first push, new branch) → `${after}~1`. Diff failure → [] (never throws).
 */
export function collectEvents({ before, after = 'HEAD', config, git, syncPrefix = 'sync', repoRoot = '' }) {
  if (!before || /^0+$/.test(before)) before = `${after}~1`;
  let changed;
  try {
    changed = git(['diff', '--name-only', before, after, '--', syncPrefix]).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
  const show = (sha, path) => {
    try { return normalizeText(git(['show', `${sha}:${path}`])); } catch { return null; }
  };

  const events = [];
  for (const path of changed.filter((p) => isNotePath(p, config, syncPrefix))) {
    const nowText = show(after, path);
    if (nowText === null) continue; // deleted
    const meta = parseFrontmatter(nowText);
    if (!meta || !isObj(meta.targets) || !Object.keys(meta.targets).length) continue;
    const note = { path, file: repoRoot ? join(repoRoot, path) : path, meta, body: splitFrontmatter(nowText).body };
    const prevText = show(before, path);
    const prev = prevText === null ? null : parseFrontmatter(prevText);

    if (!prev) {
      const sides = Object.entries(meta.targets).filter(([, s]) => OPEN_STATUSES.includes(s)).map(([s]) => s);
      if (sides.length) events.push({ kind: 'new', note, sides });
      continue;
    }
    const prevTargets = isObj(prev.targets) ? prev.targets : {};
    const disputed = Object.entries(meta.targets)
      .filter(([s, st]) => st === 'disputed' && prevTargets[s] !== 'disputed')
      .map(([s]) => s);
    if (disputed.length) events.push({ kind: 'disputed', note, sides: disputed });
    if (!allDone(prevTargets) && allDone(meta.targets)) events.push({ kind: 'closed', note, sides: Object.keys(meta.targets) });
  }
  return events;
}

/** Web link to a note file at a resolved commit sha, or null outside GitHub/GitLab CI. */
export function noteLink(path, sha, env = process.env) {
  const p = path.split('/').map(encodeURIComponent).join('/');
  if (env.GITHUB_REPOSITORY) {
    const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
    return `${server}/${env.GITHUB_REPOSITORY}/blob/${sha}/${p}`;
  }
  if (env.CI_PROJECT_URL) return `${env.CI_PROJECT_URL.replace(/\/+$/, '')}/-/blob/${sha}/${p}`;
  return null;
}

/** Per active side: notes waiting on it and its own notes disputed by others. Invalid notes are skipped. */
export function remindSections(notes, config) {
  const open = notes.filter((n) => n.meta && validateNote(n, config).length === 0 && !isClosed(n.meta));
  const sections = [];
  for (const side of Object.keys(config.sides).filter((s) => !config.paused.includes(s))) {
    const incoming = open.filter((n) => OPEN_STATUSES.includes(n.meta.targets[side])).sort(byUrgency);
    const awaitingReply = open
      .filter((n) => n.meta.from === side && Object.values(n.meta.targets).includes('disputed'))
      .sort(byUrgency);
    if (incoming.length || awaitingReply.length) sections.push({ side, incoming, awaitingReply });
  }
  return sections;
}
