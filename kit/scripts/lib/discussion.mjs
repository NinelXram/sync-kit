import { STATUSES } from './constants.mjs';

export const ENTRY_STATUSES = [...STATUSES, 'raised', 'reopened', 'verified', 'confirmed', 'withdrawn', 'reply', 'note'];
export const REF_RE = /(#\d+|(?<![\w!])!\d+\b|\bPR-?\d+\b|\b[0-9a-f]{7,40}\b|https?:\/\/\S+|\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b)/;

const SECTION_RE = /^##\s+(Discussion|Thảo luận)\s*$/i;
const ENTRY_RE = /^###\s+\[([^\]]+)\]\s+(\d{4}-\d{2}-\d{2})\s+(@\S+)\s+[—–-]\s*(.*)$/;

export function parseDiscussion(body) {
  const text = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const lines = text.split('\n');
  const entries = [];
  let inSection = false;
  let cur = null;
  const flush = () => { if (cur) { cur.text = cur.text.trim(); entries.push(cur); cur = null; } };
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      flush();
      inSection = SECTION_RE.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = line.match(ENTRY_RE);
    if (m) {
      flush();
      const tail = m[4].trim();
      const sm = tail.match(/^(\S+)\s*([\s\S]*)$/);
      cur = {
        label: m[1].trim(), date: m[2], handle: m[3],
        status: sm ? sm[1].toLowerCase() : '', rest: sm ? sm[2].trim() : '', text: '',
      };
    } else if (cur) {
      cur.text += `${line}\n`;
    }
  }
  flush();
  return entries;
}

export function strictIssues(note, config) {
  const out = { errors: [], warnings: [] };
  const meta = note.meta;
  if (!config.strict.enabled || !meta || typeof meta.created !== 'string') return out;
  if (meta.created < config.strict.since) return out;
  const entries = parseDiscussion(note.body);

  for (const e of entries) {
    if (!ENTRY_STATUSES.includes(e.status)) {
      out.warnings.push(`discussion entry [${e.label}] ${e.date}: unknown status "${e.status}"`);
    }
  }

  const targets = meta.targets && typeof meta.targets === 'object' ? meta.targets : {};
  for (const [side, status] of Object.entries(targets)) {
    if (status === 'pending') continue;
    const names = [side, config.sides[side]].filter(Boolean).map((s) => s.toLowerCase());
    const mine = entries.filter((e) => names.includes(e.label.toLowerCase()) && STATUSES.includes(e.status));
    const last = mine[mine.length - 1];
    if (!last || last.status !== status) {
      out.errors.push(`targets.${side} is "${status}" but the last ${side} discussion entry ${last ? `is "${last.status}"` : 'is missing'}`);
      continue;
    }
    const detail = `${last.rest} ${last.text}`;
    if (status === 'applied' && !REF_RE.test(detail)) {
      out.errors.push(`${side}: "applied" entry needs a reference (PR, commit, URL or ticket id)`);
    } else if ((status === 'disputed' || status === 'n/a') && !detail.trim()) {
      out.errors.push(`${side}: "${status}" entry needs a reason`);
    }
  }
  return out;
}
