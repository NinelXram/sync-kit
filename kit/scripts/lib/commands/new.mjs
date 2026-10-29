import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { readText, writeText, localDate } from '../io.mjs';
import { t } from '../i18n.mjs';
import { loadNote, validateNote } from '../notes.mjs';
import { TYPES, PRIORITIES, SLUG_RE } from '../constants.mjs';

const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function gitUserName(cwd) {
  try { return execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

export default async function newNote(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  const sides = Object.keys(config.sides);
  const flat = Object.keys(config.modules).length === 0;
  const usage =
    `Usage: node sync/scripts/sync.mjs new ${flat ? '' : `--module <${Object.keys(config.modules).join('|')}> `}--from <${sides.join('|')}> ` +
    `--to <side[,side]> --type <${TYPES.join('|')}> --slug <kebab-case> --title "..." ` +
    `[--priority ${PRIORITIES.join('|')}] [--refs "A-1,PR-2"] [--author "@handle"]`;

  const { from, to, type, slug, title } = args;
  const module = flat ? (args.module ?? 'general') : args.module;
  if (![module, from, to, type, slug, title].every((v) => typeof v === 'string' && v)) {
    console.error(usage);
    return 2;
  }

  const bad = [];
  if (!sides.includes(from)) bad.push(`--from must be one of: ${sides.join(', ')}`);
  const targets = list(to);
  if (!targets.length) bad.push('--to needs at least one side');
  for (const s of targets) {
    if (!sides.includes(s)) bad.push(`--to: unknown side "${s}" (${sides.join(', ')})`);
    else if (s === from) bad.push(`--to must not include the raising side "${from}"`);
  }
  if (!TYPES.includes(type)) bad.push(`--type must be one of: ${TYPES.join(', ')}`);
  const priority = typeof args.priority === 'string' ? args.priority : 'normal';
  if (!PRIORITIES.includes(priority)) bad.push(`--priority must be one of: ${PRIORITIES.join(', ')}`);
  if (!SLUG_RE.test(slug)) bad.push('--slug must be lowercase kebab-case (a-z, 0-9, -)');
  if (flat ? module !== 'general' : !(module in config.modules)) {
    bad.push(flat ? '--module must be "general" (config has no modules)' : `--module must be one of: ${Object.keys(config.modules).join(', ')}`);
  }
  if (/[\r\n]/.test(title)) bad.push('--title must not contain newlines');
  if (bad.length) { bad.forEach((m) => console.error(`error: ${m}`)); return 1; }

  const today = localDate();
  const id = `${today}-${from}-${slug}`;
  const dir = flat ? 'notes' : config.modules[module];
  const file = join(syncDir, dir, `${id}.md`);
  const rel = relative(repoRoot, file).replaceAll('\\', '/');
  if (existsSync(file)) { console.error(`error: already exists: ${rel}`); return 1; }

  const refs = list(args.refs);
  const author = typeof args.author === 'string' ? args.author : gitUserName(repoRoot);
  const tplFile = join(syncDir, '_TEMPLATE.md');
  const template = existsSync(tplFile) ? readText(tplFile) : '';
  const body = template.replace(/^---[\s\S]*?\n---/, '').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  const fm = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    `module: ${module}`,
    `from: ${from}`,
    `author: ${JSON.stringify(author)}`,
    `type: ${type}`,
    `priority: ${priority}`,
    `created: ${today}`,
    `refs: [${refs.join(', ')}]`,
    'targets:',
    ...targets.map((s) => `  ${s}: pending`),
    '---',
  ].join('\n');
  const text = `${fm}\n${body.startsWith('\n') ? body : `\n${body}`}`;

  const errors = validateNote(loadNote(file, repoRoot, text), config);
  if (errors.length) { errors.forEach((m) => console.error(`error: ${m}`)); return 1; }
  writeText(file, text);
  console.log(t(config.lang, 'cli.created', { path: rel }));
  return 0;
}
