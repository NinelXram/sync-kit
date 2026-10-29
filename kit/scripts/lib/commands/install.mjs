import { fileURLToPath } from 'node:url';
import { install } from '../install.mjs';

export default async function installCmd(args, ctx) {
  const kitScriptsDir = fileURLToPath(new URL('../..', import.meta.url));
  try {
    const { copied, removed } = install({ kitScriptsDir, syncDir: ctx.syncDir });
    const dest = `${ctx.syncDir.replaceAll('\\', '/')}/scripts`;
    for (const rel of removed) console.log(`removed (not in manifest): ${dest}/${rel}`);
    console.log(`installed ${copied.length} file(s) into ${dest}`);
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}
