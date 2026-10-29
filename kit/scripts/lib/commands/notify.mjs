import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { t } from '../i18n.mjs';
import { collectEvents } from '../events.mjs';
import { buildMessages } from '../message.mjs';
import { deliver } from '../channels/index.mjs';

/** notify --before <sha> --after <sha> [--dry-run]: announce new / newly disputed / closed notes. */
export default async function notify(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  const after = typeof args.after === 'string' ? args.after : 'HEAD';
  const before = typeof args.before === 'string' ? args.before : '';
  const git = (a) => {
    const r = spawnSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a[0]} failed`);
    return r.stdout;
  };
  const syncPrefix = relative(repoRoot, syncDir).replaceAll('\\', '/');
  const events = collectEvents({ before, after, config, git, syncPrefix, repoRoot });
  if (!events.length) {
    console.log(t(config.lang, 'notify.none'));
    return 0;
  }
  let sha = after;
  try { sha = git(['rev-parse', '--verify', `${after}^{commit}`]).trim(); } catch { /* keep ref */ }
  const messages = buildMessages(events, config, { sha, env: process.env });
  return deliver(messages, config, { dryRun: Boolean(args['dry-run']) });
}
