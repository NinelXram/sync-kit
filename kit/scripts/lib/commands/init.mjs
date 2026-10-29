import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readText, writeText } from '../io.mjs';
import { noteDirs } from '../config.mjs';
import { renderGenerated, replaceBetween, GEN_START, GEN_END } from '../readme.mjs';
import inbox from './inbox.mjs';

const tpl = (lang, name) => new URL(`../../templates/${lang}/${name}`, import.meta.url);

function ensureGitignore(repoRoot) {
  const file = join(repoRoot, '.gitignore');
  const line = 'sync/INBOX*.md';
  const cur = existsSync(file) ? readText(file) : '';
  if (cur.split('\n').some((l) => l.trim() === line)) return;
  writeText(file, cur === '' || cur.endsWith('\n') ? `${cur}${line}\n` : `${cur}\n${line}\n`);
}

export default async function init(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  for (const d of noteDirs(config)) mkdirSync(join(syncDir, d), { recursive: true });

  const readme = join(syncDir, 'README.md');
  const src = existsSync(readme) ? readText(readme) : readText(tpl(config.lang, 'README.md'));
  const next = replaceBetween(src, GEN_START, GEN_END, renderGenerated(config));
  if (next === null) console.error('warning: sync/README.md has no sync-kit:generated markers; left untouched');
  else writeText(readme, next);

  const template = join(syncDir, '_TEMPLATE.md');
  if (!existsSync(template)) writeText(template, readText(tpl(config.lang, '_TEMPLATE.md')));

  if (!config.inbox.commit) ensureGitignore(repoRoot);
  return inbox(args, ctx);
}
