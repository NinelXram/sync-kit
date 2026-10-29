import { matchAny } from './glob.mjs';
import { noteDirs } from './config.mjs';

/**
 * changed: repo-relative POSIX paths. syncPrefix: repo-relative POSIX path of the sync dir (default "sync").
 * Note files = changed *.md under <syncPrefix>/<noteDir>/, except README/_TEMPLATE.
 */
export function contractCheck({ changed, config, syncPrefix = 'sync' }) {
  const globs = Object.values(config.contract?.globs ?? {}).flat();
  const contractFiles = changed.filter((f) => matchAny(globs, f));
  const dirs = noteDirs(config).map((d) => `${syncPrefix}/${d}/`.replace(/\/+/g, '/'));
  const noteFiles = changed.filter((f) => {
    if (!f.endsWith('.md')) return false;
    const base = f.slice(f.lastIndexOf('/') + 1);
    if (base === 'README.md' || base === '_TEMPLATE.md') return false;
    return dirs.some((d) => f.startsWith(d));
  });
  return { contractFiles, noteFiles, warn: contractFiles.length > 0 && noteFiles.length === 0 };
}
