import { existsSync, readdirSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { readText } from './io.mjs';
import { parseFrontmatter, splitFrontmatter } from './frontmatter.mjs';
import { noteDirs } from './config.mjs';
import { TYPES, PRIORITIES, STATUSES, OPEN_STATUSES, DONE_STATUSES, REQUIRED_FIELDS, SLUG_RE } from './constants.mjs';

const SKIP = new Set(['README.md', '_TEMPLATE.md']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Empty frontmatter values parse to {}; treat {} / '' / undefined as missing.
const missing = (v) => v === undefined || v === '' || (isObj(v) && Object.keys(v).length === 0);
const posix = (p) => p.replaceAll('\\', '/').replace(/\/+$/, '');

export function listNoteFiles(syncDir, config) {
  const files = [];
  for (const dir of noteDirs(config)) {
    const abs = join(syncDir, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.md') && !SKIP.has(f)) files.push(join(abs, f));
    }
  }
  return files.sort();
}

export function loadNote(absPath, repoRoot, text = readText(absPath)) {
  return {
    path: posix(relative(repoRoot, absPath)),
    file: absPath,
    meta: parseFrontmatter(text),
    body: splitFrontmatter(text).body,
  };
}

export function validateNote(note, config) {
  const { meta } = note;
  if (!meta) return ['missing frontmatter (--- ... ---) at the top of the file'];
  const errors = [];
  const sides = Object.keys(config.sides);
  const flat = Object.keys(config.modules).length === 0;
  const name = basename(note.file, '.md');

  for (const k of REQUIRED_FIELDS) if (missing(meta[k])) errors.push(`missing field \`${k}\``);

  if (!missing(meta.id)) {
    if (meta.id !== name) errors.push(`\`id\` (${meta.id}) must match the file name (${name})`);
    else if (!meta.id.startsWith(`${meta.created}-${meta.from}-`) && DATE_RE.test(meta.created) && sides.includes(meta.from)) {
      errors.push(`\`id\` must start with <created>-<from>- (${meta.created}-${meta.from}-)`);
    } else if (DATE_RE.test(meta.created) && meta.id.startsWith(`${meta.created}-${meta.from}-`)) {
      const slug = meta.id.slice(`${meta.created}-${meta.from}-`.length);
      if (!SLUG_RE.test(slug)) errors.push(`\`id\` slug must be lowercase kebab-case (a-z, 0-9, -): ${slug}`);
    }
  }

  if (!missing(meta.module)) {
    if (flat) {
      if (meta.module !== 'general') errors.push(`\`module\` must be \`general\` when config has no modules (got ${meta.module})`);
      else if (posix(note.path.split('/').slice(0, -1).join('/')) !== 'sync/notes') errors.push('module `general` notes must live in sync/notes/');
    } else if (!(meta.module in config.modules)) {
      errors.push(`invalid \`module\`: ${meta.module}`);
    } else {
      const want = `sync/${posix(config.modules[meta.module])}`;
      const have = note.path.split('/').slice(0, -1).join('/');
      if (have !== want) errors.push(`module \`${meta.module}\` notes must live in ${want}/ (wrong directory: ${have}/)`);
    }
  }

  if (!missing(meta.from) && !sides.includes(meta.from)) errors.push(`invalid \`from\`: ${meta.from}`);
  if (!missing(meta.type) && !TYPES.includes(meta.type)) errors.push(`invalid \`type\`: ${meta.type}`);
  if (!missing(meta.priority) && !PRIORITIES.includes(meta.priority)) errors.push(`invalid \`priority\`: ${meta.priority}`);
  if (!missing(meta.created) && !DATE_RE.test(meta.created)) errors.push('`created` must be YYYY-MM-DD');

  if (isObj(meta.targets) && Object.keys(meta.targets).length) {
    for (const [side, status] of Object.entries(meta.targets)) {
      if (!sides.includes(side)) errors.push(`targets: invalid side \`${side}\``);
      if (side === meta.from) errors.push(`targets: the raising side (\`${side}\`) cannot target itself`);
      if (!STATUSES.includes(status)) errors.push(`targets.${side}: invalid status \`${status}\``);
    }
  } else if (!missing(meta.targets)) {
    errors.push('`targets` must be a map with at least one side, e.g. `fe: pending`');
  }
  return errors;
}

export const isClosed = (meta) => Object.values(meta.targets).every((s) => DONE_STATUSES.includes(s));

export const isOpenForActive = (meta, config) =>
  Object.entries(meta.targets).some(([side, s]) => !config.paused.includes(side) && OPEN_STATUSES.includes(s));

const priorityRank = (meta) => PRIORITIES.indexOf(meta.priority);
export const byUrgency = (a, b) =>
  priorityRank(a.meta) - priorityRank(b.meta) || a.meta.created.localeCompare(b.meta.created);
