import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { readText, annotate } from '../io.mjs';
import { t } from '../i18n.mjs';
import { listNoteFiles, loadNote, validateNote } from '../notes.mjs';
import { strictIssues } from '../discussion.mjs';
import { inboxFiles } from '../inbox.mjs';

/** Pure check (no output): { errors, warnings, issues, notes }. issues = [{level,file,msg}] in report order. */
export function runCheck({ syncDir, repoRoot, config }) {
  const notes = listNoteFiles(syncDir, config).map((f) => loadNote(f, repoRoot));
  const issues = [];
  const add = (level) => (file, msg) => issues.push({ level, file, msg });
  const error = add('error');
  const warning = add('warning');

  for (const n of notes) {
    for (const msg of validateNote(n, config)) error(n.path, msg);
    const s = strictIssues(n, config);
    for (const msg of s.errors) error(n.path, msg);
    for (const msg of s.warnings) warning(n.path, msg);
  }

  if (config.inbox.commit) {
    for (const [file, content] of inboxFiles(notes, config, syncDir)) {
      if (!existsSync(file) || readText(file) !== content) {
        const rel = relative(repoRoot, file).replaceAll('\\', '/');
        error(rel, t(config.lang, 'cli.inboxStale', { file: rel }));
      }
    }
  }
  const pick = (level) => issues.filter((i) => i.level === level).map(({ file, msg }) => ({ file, msg }));
  return { errors: pick('error'), warnings: pick('warning'), issues, notes: notes.length };
}

export default async function check(args, ctx) {
  const { errors, issues, notes } = runCheck(ctx);
  for (const i of issues) console.log(annotate(i.level, i.file, i.msg));
  if (errors.length) return 1;
  console.log(t(ctx.config.lang, 'cli.checkOk', { n: notes }));
  return 0;
}
