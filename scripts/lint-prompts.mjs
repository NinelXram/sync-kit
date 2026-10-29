import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['Goal', 'Preconditions', 'Inputs', 'Steps', 'Hard rules', 'Outputs', 'Verify', 'Handoff'];

export function lintPrompt(text, file) {
  const errors = [];
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const id = path.basename(file).replace(/\.md$/, '');

  const m = /^<!-- sync-kit prompt: (\S+) v1 -->$/.exec(lines[0]);
  if (!m) errors.push('line 1 must be `<!-- sync-kit prompt: <id> v1 -->`');
  else if (m[1] !== id) errors.push(`prompt id "${m[1]}" does not match file name "${id}"`);

  // H2 headings outside code fences, with section bodies
  const sections = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^## (.+?)\s*$/.exec(line);
    if (h) sections.push({ name: h[1], body: [] });
    else if (sections.length) sections.at(-1).body.push(line);
  }
  const names = sections.map((s) => s.name);
  let last = -1;
  for (const req of REQUIRED) {
    const idx = names.indexOf(req);
    if (idx === -1) errors.push(`missing H2 section "${req}"`);
    else if (idx < last) errors.push(`H2 section "${req}" is out of order (expected: ${REQUIRED.join(', ')})`);
    else last = idx;
  }
  const verify = sections.find((s) => s.name === 'Verify');
  if (verify && !verify.body.join('\n').includes('sync.mjs doctor')) {
    errors.push('section "Verify" must contain `sync.mjs doctor`');
  }

  if (/\/main\//.test(src) || /@main\b/.test(src)) errors.push('must not reference unpinned main (`/main/` or `@main`)');
  if (/(\bcp\b|Copy-Item)[^\n]*kit[\/]scripts/i.test(src)) {
    errors.push('must not copy kit/scripts (install the engine only via `sync.mjs install`)');
  }
  if (/\$KIT\b|%KIT%|\$env:KIT\b|\$\{KIT\}/.test(src)) {
    errors.push('must not use a KIT variable; use the fixed path `.sync-kit/kit/...`');
  }
  return errors;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

function main() {
  const dir = path.join(ROOT, 'prompts');
  if (!existsSync(dir)) return 0;
  let bad = 0;
  for (const abs of walk(dir)) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (rel === 'prompts/README.md') continue;
    for (const e of lintPrompt(readFileSync(abs, 'utf8'), rel)) {
      console.log(`${rel}: ${e}`);
      bad++;
    }
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
