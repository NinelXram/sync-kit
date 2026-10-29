import { t } from './i18n.mjs';

export const GEN_START = '<!-- sync-kit:generated:start -->';
export const GEN_END = '<!-- sync-kit:generated:end -->';
export const RULES_START = '<!-- sync-kit:project-rules:start -->';
export const RULES_END = '<!-- sync-kit:project-rules:end -->';

const esc = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/** Sides / modules / topology tables for the README generated block. Deterministic. */
export function renderGenerated(config) {
  const L = (k, v) => t(config.lang, k, v);
  const out = [
    `**${L('readme.topology')}:** ${L(`readme.topology.${config.topology}`)}`,
    '',
    `**${L('readme.sides')}**`,
    '',
    `| ${L('readme.col.id')} | ${L('readme.col.label')} | ${L('readme.col.paused')} |`,
    '| --- | --- | --- |',
    ...Object.entries(config.sides).map(
      ([id, label]) => `| \`${id}\` | ${esc(label)} | ${config.paused.includes(id) ? L('readme.yes') : ''} |`,
    ),
    '',
    `**${L('readme.modules')}**`,
    '',
  ];
  const mods = Object.entries(config.modules);
  if (!mods.length) out.push(L('readme.flat'));
  else {
    out.push(`| ${L('readme.col.module')} | ${L('readme.col.dir')} |`, '| --- | --- |');
    for (const [name, dir] of mods) out.push(`| \`${esc(name)}\` | \`${esc(dir)}/\` |`);
  }
  return out.join('\n');
}

/** Replace the content between start/end markers; returns null when markers are missing. */
export function replaceBetween(text, start, end, content) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return null;
  return `${text.slice(0, a + start.length)}\n${content}\n${text.slice(b)}`;
}
