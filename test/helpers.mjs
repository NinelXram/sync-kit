import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

export function gitCommit(root, msg) {
  const env = { ...process.env, ...GIT_ENV };
  spawnSync('git', ['add', '-A'], { cwd: root, env });
  return spawnSync('git', ['commit', '-m', msg], { cwd: root, env, encoding: 'utf8' });
}

export async function makeTempRepo(files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'sync-kit-'));
  const env = { ...process.env, ...GIT_ENV };
  spawnSync('git', ['init', '-q'], { cwd: root, env });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  const syncDir = path.join(root, 'sync');
  const kitScripts = path.join(REPO_ROOT, 'kit', 'scripts');
  if (existsSync(kitScripts)) {
    await cp(kitScripts, path.join(syncDir, 'scripts'), { recursive: true });
  }
  return {
    root,
    syncDir,
    run(args) {
      const r = spawnSync(process.execPath, ['sync/scripts/sync.mjs', ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
