import { readText } from './io.mjs';

export const START = '<!-- sync-kit:start -->';
export const END = '<!-- sync-kit:end -->';

const wrap = (block) => (block.includes(START) && block.includes(END) ? block : `${START}\n${block.replace(/\n+$/, '')}\n${END}`);

/** Why the file's markers are unusable (orphan START/END, duplicates, wrong order), or null if fine. */
export function markerProblem(fileText) {
  const count = (m) => fileText.split(m).length - 1;
  const s = count(START);
  const e = count(END);
  if (s === 0 && e === 0) return null;
  if (s === 1 && e === 1 && fileText.indexOf(START) < fileText.indexOf(END)) return null;
  return `expected one "${START}" followed by one "${END}", found ${s} start and ${e} end marker(s)`;
}

/**
 * Insert or replace the marked block. Text outside the markers is preserved byte-for-byte.
 * Lines the kit adds (block and separators) use `eol`. Callers must check markerProblem() first.
 */
export function upsertBlock(fileText, block, eol = '\n') {
  const full = wrap(block).replace(/\r?\n/g, eol);
  const s = fileText.indexOf(START);
  const e = s === -1 ? -1 : fileText.indexOf(END, s + START.length);
  if (s !== -1 && e !== -1) return fileText.slice(0, s) + full + fileText.slice(e + END.length);
  if (fileText === '') return `${full}${eol}`;
  const base = fileText.endsWith('\n') ? fileText : `${fileText}${eol}`;
  return `${base}${eol}${full}${eol}`;
}

/** Render the agent-rules template for config.lang. */
export function renderBlock(config) {
  const tpl = readText(new URL(`../templates/${config.lang}/agent-rules.md`, import.meta.url));
  const sides = Object.entries(config.sides).map(([id, label]) => `\`${id}\` (${label})`).join(', ');
  const globs = Object.entries(config.contract.globs).flatMap(([side, gs]) => gs.map((g) => `- \`${g}\` (${side})`));
  const contract = globs.length ? globs.join('\n') : '- (none configured)';
  const body = tpl.replace('{{sides}}', () => sides).replace('{{contract}}', () => contract);
  return wrap(body);
}
