import { join } from 'node:path';
import { t } from './i18n.mjs';
import { OPEN_STATUSES } from './constants.mjs';
import { validateNote, isClosed, isOpenForActive, byUrgency } from './notes.mjs';

const esc = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/**
 * Render INBOX.md (or INBOX-<SIDE>.md when `opts.paused`). Notes that fail validation are skipped.
 * Deterministic: no timestamps.
 */
export function renderInbox(notes, config, { sides = Object.keys(config.sides), paused = false } = {}) {
  const L = (k, v) => t(config.lang, k, v);
  const label = (s) => config.sides[s] ?? s;
  const valid = notes.filter((n) => n.meta && validateNote(n, config).length === 0);
  const open = valid.filter((n) => !isClosed(n.meta));
  const closedCount = valid.length - open.length;
  const openActive = open.filter((n) => isOpenForActive(n.meta, config));
  const pausedOnly = open.length - openActive.length;
  const link = (n) => `[${n.meta.id}](${n.path.replace(/^sync\//, '')})`;
  const row = (n, last) =>
    `| ${link(n)} | ${esc(n.meta.title)} | ${esc(n.meta.module)} | ${esc(label(n.meta.from))} | ${n.meta.type} | ${n.meta.priority} | ${esc(last)} |`;
  const header = (cols) => [`| ${cols.map((c) => L(`inbox.col.${c}`)).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`];

  const out = paused
    ? [`# ${L('inbox.pausedTitle', { sides: sides.map(label).join(', ') })}`, '', L('inbox.pausedNote1'), L('inbox.pausedNote2'), '']
    : [
        `# ${L('inbox.title')}`, '', L('inbox.generated'), '',
        L('inbox.counts', { open: openActive.length, closed: closedCount }) + (pausedOnly ? L('inbox.countsPaused', { n: pausedOnly }) : ''),
        '',
      ];

  for (const side of sides) {
    const incoming = open.filter((n) => OPEN_STATUSES.includes(n.meta.targets[side])).sort(byUrgency);
    const awaitingReply = open
      .filter((n) => n.meta.from === side && Object.values(n.meta.targets).includes('disputed'))
      .sort(byUrgency);

    out.push(`## ${label(side)}`, '');
    if (!paused && config.paused.includes(side)) {
      const file = `INBOX-${side.toUpperCase()}.md`;
      out.push(L('inbox.pausedPointer', { n: incoming.length, side: label(side), file }), '');
      continue;
    }
    if (!incoming.length && !awaitingReply.length) {
      out.push(L('inbox.none'), '');
      continue;
    }
    if (incoming.length) {
      out.push(L('inbox.actionable'), '', ...header(['note', 'title', 'module', 'from', 'type', 'priority', 'status']));
      incoming.forEach((n) => out.push(row(n, n.meta.targets[side])));
      out.push('');
    }
    if (awaitingReply.length) {
      out.push(L('inbox.disputed'), '', ...header(['note', 'title', 'module', 'from', 'type', 'priority', 'disputedBy']));
      awaitingReply.forEach((n) =>
        out.push(row(n, Object.entries(n.meta.targets).filter(([, s]) => s === 'disputed').map(([s]) => label(s)).join(', '))),
      );
      out.push('');
    }
  }
  return out.join('\n').trimEnd();
}

/** INBOX.md plus one INBOX-<SIDE>.md per paused side. Returns [absPath, content] pairs. */
export function inboxFiles(notes, config, syncDir) {
  return [
    [join(syncDir, 'INBOX.md'), renderInbox(notes, config) + '\n'],
    ...config.paused.map((side) => [
      join(syncDir, `INBOX-${side.toUpperCase()}.md`),
      renderInbox(notes, config, { sides: [side], paused: true }) + '\n',
    ]),
  ];
}
