import { doctor } from '../doctor.mjs';

const MARK = { ok: '✓', error: '✗', warn: '!' };

export default async function doctorCmd(args, ctx) {
  const phase = args.phase;
  if (phase !== undefined && (typeof phase !== 'string' || !/^0[0-5]$/.test(phase))) {
    console.error('Usage: doctor [--phase 00-05] [--json] [--sync-dir <path>]');
    return 2;
  }
  const res = doctor({ syncDir: ctx.syncDir, repoRoot: ctx.repoRoot, phase });
  if (args.json) console.log(JSON.stringify({ ok: res.ok, checks: res.checks }, null, 2));
  else for (const c of res.checks) console.log(`${c.ok ? MARK.ok : MARK[c.level]} ${c.msg}`);
  return res.ok ? 0 : 1;
}
