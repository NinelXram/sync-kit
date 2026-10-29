import { writeText } from '../io.mjs';
import { listNoteFiles, loadNote } from '../notes.mjs';
import { inboxFiles } from '../inbox.mjs';

export default async function inbox(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  const notes = listNoteFiles(syncDir, config).map((f) => loadNote(f, repoRoot));
  for (const [file, content] of inboxFiles(notes, config, syncDir)) writeText(file, content);
  return 0;
}
