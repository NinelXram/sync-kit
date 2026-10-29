import { annotate } from '../io.mjs';
import { t } from '../i18n.mjs';
import { listNoteFiles, loadNote, validateNote } from '../notes.mjs';
import { remindSections } from '../events.mjs';
import { buildMessages } from '../message.mjs';
import { deliver } from '../channels/index.mjs';

/** remind [--dry-run]: per active side, list notes waiting on it (scheduled job). Invalid notes are skipped with a warning. */
export default async function remind(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  const notes = listNoteFiles(syncDir, config).map((f) => loadNote(f, repoRoot));
  for (const n of notes) {
    if (validateNote(n, config).length) console.log(annotate('warning', n.path, t(config.lang, 'remind.skipInvalid')));
  }
  const sections = remindSections(notes, config);
  if (!sections.length) {
    console.log(t(config.lang, 'remind.none'));
    return 0;
  }
  return deliver(buildMessages(sections, config), config, { dryRun: Boolean(args['dry-run']) });
}
