import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export function normalizeText(s) {
  return s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

export function readText(path) {
  return normalizeText(readFileSync(path, 'utf8'));
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    let val = true;
    if (next !== undefined && !next.startsWith('--')) { val = next; i++; }
    if (key in out) out[key] = [].concat(out[key], val);
    else out[key] = val;
  }
  return out;
}

/** Positional (non-flag) arguments, using the same value-consumption rule as parseArgs. */
export function positionals(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) i++;
    } else out.push(a);
  }
  return out;
}

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sha256File(path) {
  return createHash('sha256').update(readText(path), 'utf8').digest('hex');
}

export function annotate(level, file, msg, env = process.env) {
  if (env.GITHUB_ACTIONS === 'true') return file ? `::${level} file=${file}::${msg}` : `::${level}::${msg}`;
  return file ? `${level}: ${file}: ${msg}` : `${level}: ${msg}`;
}
