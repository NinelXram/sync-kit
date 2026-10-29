import { existsSync, readdirSync, readFileSync, copyFileSync, mkdirSync, rmSync, rmdirSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { sha256File } from './io.mjs';

export const MANIFEST = 'MANIFEST.json';

/** All files under `dir` as sorted POSIX relative paths. */
export function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
}

/** { relPath: sha256 } for every file in scriptsDir except MANIFEST.json, keys sorted. */
export function buildManifest(scriptsDir) {
  const m = {};
  for (const rel of listFiles(scriptsDir)) if (rel !== MANIFEST) m[rel] = sha256File(join(scriptsDir, rel));
  return m;
}

function readManifest(scriptsDir) {
  const file = join(scriptsDir, MANIFEST);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Problems ("missing: x", "modified: x", "extra: x") comparing scriptsDir with its MANIFEST.json. [] = intact. */
export function verifyManifest(scriptsDir) {
  const manifest = readManifest(scriptsDir);
  if (!manifest) return [`missing: ${MANIFEST} (or invalid JSON)`];
  const problems = [];
  const actual = new Set(listFiles(scriptsDir));
  for (const [rel, hash] of Object.entries(manifest)) {
    if (!actual.has(rel)) problems.push(`missing: ${rel}`);
    else if (sha256File(join(scriptsDir, rel)) !== hash) problems.push(`modified: ${rel}`);
  }
  for (const rel of actual) if (rel !== MANIFEST && !Object.hasOwn(manifest, rel)) problems.push(`extra: ${rel}`);
  return problems;
}

const canon = (p) => {
  let r = resolve(p);
  try { r = realpathSync(r); } catch { /* not created yet */ }
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

function removeEmptyDirs(dir, root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) removeEmptyDirs(join(dir, e.name), root);
  }
  if (dir !== root && readdirSync(dir).length === 0) rmdirSync(dir);
}

/**
 * Copy the engine from kitScriptsDir into <syncDir>/scripts.
 * Verifies the source against its manifest first; removes files in the destination that are not in the manifest.
 * Never touches anything outside <syncDir>/scripts.
 */
export function install({ kitScriptsDir, syncDir }) {
  const dest = join(syncDir, 'scripts');
  if (canon(kitScriptsDir) === canon(dest)) {
    throw new Error(`refusing to install onto itself (${dest}); run the kit copy: node .sync-kit/kit/scripts/sync.mjs install --sync-dir sync`);
  }
  const problems = verifyManifest(kitScriptsDir);
  if (problems.length) throw new Error(`kit source does not match its ${MANIFEST}:\n- ${problems.join('\n- ')}`);
  const manifest = readManifest(kitScriptsDir);

  const copied = [];
  for (const rel of [...Object.keys(manifest), MANIFEST]) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(kitScriptsDir, rel), to);
    copied.push(rel);
  }
  const removed = [];
  for (const rel of listFiles(dest)) {
    if (rel !== MANIFEST && !Object.hasOwn(manifest, rel)) {
      rmSync(join(dest, rel));
      removed.push(rel);
    }
  }
  removeEmptyDirs(dest, dest);
  return { copied, removed };
}
