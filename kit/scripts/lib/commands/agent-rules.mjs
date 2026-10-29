import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeText, annotate } from '../io.mjs';
import { upsertBlock, renderBlock, markerProblem } from '../agentRules.mjs';

const MDC_FRONTMATTER = '---\ndescription: sync-kit sync notes protocol\nalwaysApply: true\n---\n';

/** Line-ending style of an existing file: CRLF when most line breaks are CRLF. */
function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

export default async function agentRules(args, ctx) {
  const { repoRoot, config } = ctx;
  const files = [].concat(args.file === undefined || args.file === true ? [] : args.file);
  if (!files.length) {
    console.error('Usage: agent-rules --file <repo-relative path> [--file <path> ...]');
    return 2;
  }
  // Agent files belong to the user: keep their BOM and line endings; new files are LF without BOM.
  const plans = files.map((rel) => {
    const abs = resolve(repoRoot, rel);
    const exists = existsSync(abs);
    const raw = exists ? readFileSync(abs, 'utf8') : null;
    const bom = exists && raw.startsWith('\uFEFF') ? '\uFEFF' : '';
    const text = exists ? raw.slice(bom.length) : (abs.endsWith('.mdc') ? MDC_FRONTMATTER : '');
    return { rel, abs, exists, raw, bom, text, eol: exists ? detectEol(text) : '\n' };
  });
  const bad = plans.filter((p) => markerProblem(p.text));
  if (bad.length) {
    for (const p of bad) {
      console.error(annotate('error', p.rel, `${markerProblem(p.text)}. Fix the sync-kit markers by hand (keep one start and one end, or remove both), then re-run. No file was changed.`));
    }
    return 1;
  }
  const block = renderBlock(config);
  for (const p of plans) {
    const next = p.bom + upsertBlock(p.text, block, p.eol);
    if (!p.exists || p.raw !== next) writeText(p.abs, next);
    console.log(`${p.exists ? 'updated' : 'created'}: ${p.rel}`);
  }
  return 0;
}
