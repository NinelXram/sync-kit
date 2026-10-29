import { readFileSync, existsSync } from 'node:fs';
import { readText, localDate, positionals } from '../io.mjs';
import { initState, setPhase, setDecisions, statePath } from '../state.mjs';

const USAGE = [
  'Usage:',
  '  state init --kit-ref <tag>',
  '  state decide [--topology monorepo|single] [--ci github|gitlab|none] [--agent-file <path> ... | --no-agent-files] [--channel telegram|gchat|none] [--lang en|vi]',
  '  state phase <00-05> done|skipped',
  '  state show',
  '  state today',
].join('\n');

const str = (v) => (typeof v === 'string' && v !== '' ? v : null);

export default async function state(args, ctx) {
  const { syncDir } = ctx;
  const [sub, ...pos] = positionals(ctx.argv ?? []);
  const usage = () => { console.error(USAGE); return 2; };
  try {
    switch (sub) {
      case 'init': {
        const kitRef = str(args['kit-ref']);
        if (!kitRef) return usage();
        const kitVersion = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
        initState(syncDir, { kitVersion, kitRef });
        break;
      }
      case 'decide': {
        const partial = {};
        for (const k of ['topology', 'ci', 'channel', 'lang']) {
          if (args[k] === undefined) continue;
          if (Array.isArray(args[k]) || !str(args[k])) return usage();
          partial[k] = args[k];
        }
        if (args['no-agent-files'] !== undefined) {
          if (args['no-agent-files'] !== true || args['agent-file'] !== undefined) return usage();
          partial.agentFiles = [];
        }
        if (args['agent-file'] !== undefined) {
          const files = [].concat(args['agent-file']);
          if (!files.every(str)) return usage();
          partial.agentFiles = files;
        }
        if (!Object.keys(partial).length) return usage();
        setDecisions(syncDir, partial);
        break;
      }
      case 'phase': {
        if (pos.length !== 2) return usage();
        setPhase(syncDir, pos[0], pos[1]);
        break;
      }
      case 'show': {
        const file = statePath(syncDir);
        if (!existsSync(file)) { console.error('error: state.json not found — run `state init --kit-ref <tag>` first'); return 1; }
        process.stdout.write(readText(file));
        return 0;
      }
      case 'today':
        console.log(localDate());
        return 0;
      default:
        return usage();
    }
  } catch (e) {
    for (const m of e.errors ?? [e.message]) console.error(`error: ${m}`);
    return 1;
  }
  console.log(`updated ${statePath(syncDir).replaceAll('\\', '/')}`);
  return 0;
}
