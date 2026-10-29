import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { annotate } from '../io.mjs';
import { t } from '../i18n.mjs';
import { contractCheck } from '../contract.mjs';

export default async function contractCheckCmd(args, ctx) {
  const { syncDir, repoRoot, config } = ctx;
  const base = typeof args.base === 'string' ? args.base : null;
  const head = typeof args.head === 'string' ? args.head : 'HEAD';
  if (base === null) {
    console.error('Usage: contract-check --base <ref> [--head <ref>] [--strict]');
    return 2;
  }
  // an empty CI variable (e.g. GitLab with no target branch) is not a usage error: skip, never block
  if (!base.trim()) {
    console.log(t(config.lang, 'cli.contractSkipped', { base: '--base ""' }));
    return 0;
  }
  const git = (a) => spawnSync('git', a, { cwd: repoRoot, encoding: 'utf8' });
  const resolves = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;
  if (!resolves(base) || !resolves(head)) {
    console.log(t(config.lang, 'cli.contractSkipped', { base: resolves(base) ? head : base }));
    return 0;
  }
  const diff = git(['diff', '--name-only', base, head]);
  if (diff.status !== 0) {
    console.log(t(config.lang, 'cli.contractSkipped', { base }));
    return 0;
  }
  const changed = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const syncPrefix = relative(repoRoot, syncDir).replaceAll('\\', '/');
  const r = contractCheck({ changed, config, syncPrefix });
  if (!r.warn) {
    console.log(t(config.lang, 'cli.contractOk'));
    return 0;
  }
  console.log(annotate('warning', null, t(config.lang, 'cli.contractWarn', { n: r.contractFiles.length })));
  for (const f of r.contractFiles) console.log(`  - ${f}`);
  return args.strict ? 1 : 0;
}
