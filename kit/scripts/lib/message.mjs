// Message = { icon, title, lines, mentions, link?: { url, text }, threadKey? } — channel-neutral plain strings.
// Builders turn events/remind sections into Messages; render/renderParts apply a channel's markup.
import { t } from './i18n.mjs';
import { noteLink } from './events.mjs';

const PRIORITY_ICON = { blocker: '🔴', high: '🟠', normal: '⚪', low: '▫️' };

// ---------- builders ----------

const uniq = (a) => [...new Set(a)];

function mentionsFor(sides, config) {
  if (config.notify.channel === 'gchat') return []; // Google Chat webhooks cannot mention by handle
  const m = config.notify.managers ?? {};
  return uniq(sides.flatMap((s) => (Object.hasOwn(m, s) && Array.isArray(m[s]) ? m[s] : [])).map((h) => h.trim()).filter(Boolean));
}

function eventMessage(ev, config, ctx) {
  const L = (k, v) => t(config.lang, k, v);
  const label = (s) => config.sides[s] ?? s;
  const { note, kind, sides } = ev;
  const m = note.meta;
  const url = noteLink(note.path, ctx.sha ?? 'HEAD', ctx.env ?? process.env);
  const lines = [
    String(m.title ?? ''),
    L('notify.meta', { id: m.id, module: m.module, type: m.type, priority: m.priority }),
  ];
  if (!url) lines.push(`📄 ${note.path}`);
  const from = label(m.from);
  const names = sides.map(label).join(', ');
  let msg;
  if (kind === 'new') {
    msg = { icon: '📮', title: L('notify.new', { from, sides: names }), lines: [...lines, L('notify.newAsk')], mentions: mentionsFor(sides, config) };
  } else if (kind === 'disputed') {
    msg = { icon: '⚠️', title: L('notify.disputed', { from, sides: names }), lines: [...lines, L('notify.disputedAsk')], mentions: mentionsFor([m.from], config) };
  } else {
    msg = { icon: '✅', title: L('notify.closed'), lines, mentions: mentionsFor([m.from], config) };
  }
  if (url) msg.link = { url, text: L('notify.viewNote') };
  if (m.id) msg.threadKey = String(m.id);
  return msg;
}

function remindMessage(section, config) {
  const L = (k, v) => t(config.lang, k, v);
  const label = (s) => config.sides[s] ?? s;
  const max = config.notify.remindMaxItems;
  const { side, incoming, awaitingReply } = section;
  const item = (n, extra) => `${PRIORITY_ICON[n.meta.priority] ?? '•'} ${n.meta.id} — ${n.meta.title}${extra ? ` (${extra})` : ''}`;
  const list = (notes, extra) => {
    const out = notes.slice(0, max).map((n) => item(n, extra(n)));
    if (notes.length > max) out.push(L('remind.more', { n: notes.length - max }));
    return out;
  };
  const lines = [];
  if (incoming.length) {
    const urgent = incoming.filter((n) => ['blocker', 'high'].includes(n.meta.priority)).length;
    lines.push(L('remind.incoming', { n: incoming.length }) + (urgent ? L('remind.urgent', { n: urgent }) : ''));
    lines.push(...list(incoming, (n) => (n.meta.targets[side] === 'pending' ? '' : n.meta.targets[side])));
  }
  if (awaitingReply.length) {
    lines.push(L('remind.awaiting', { n: awaitingReply.length }));
    lines.push(...list(awaitingReply, (n) =>
      L('remind.disputedBy', { sides: Object.entries(n.meta.targets).filter(([, s]) => s === 'disputed').map(([s]) => label(s)).join(', ') })));
  }
  lines.push(L('remind.footer'));
  const msg = { icon: '⏰', title: L('remind.title', { side: label(side) }), lines, mentions: mentionsFor([side], config) };
  if (config.notify.siteUrl) msg.link = { url: config.notify.siteUrl, text: L('remind.siteLink') };
  return msg;
}

/** Events (from collectEvents) or remind sections (from remindSections) → Message[]. ctx = { sha, env } for events. */
export function buildMessages(items, config, ctx = {}) {
  return items.map((it) => ('kind' in it ? eventMessage(it, config, ctx) : remindMessage(it, config)));
}

// ---------- rendering ----------

const ESC = {
  html: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  gchat: (s) => s.replace(/</g, '‹').replace(/>/g, '›'),
  plain: (s) => s,
};
const htmlAttr = (s) => ESC.html(s).replace(/"/g, '&quot;');
const gchatUrl = (s) => s.replace(/\|/g, '%7C').replace(/</g, '%3C').replace(/>/g, '%3E');

/** Pieces of a message: each `fmt(rawChunk)` renders one output line; per-character escaping keeps chunks independent. */
function pieces(msg, flavor) {
  if (!ESC[flavor]) throw new Error(`unknown flavor: ${flavor}`);
  const esc = ESC[flavor];
  const icon = msg.icon ? `${msg.icon} ` : '';
  const out = [];
  const title = { html: (c) => `${icon}<b>${esc(c)}</b>`, gchat: (c) => `${icon}*${esc(c)}*`, plain: (c) => `${icon}${c}` }[flavor];
  out.push({ text: String(msg.title ?? ''), fmt: title });
  for (const l of msg.lines ?? []) out.push({ text: String(l), fmt: esc });
  if (flavor !== 'gchat' && msg.mentions?.length) out.push({ text: msg.mentions.join(' '), fmt: (c) => c }); // verbatim
  if (msg.link) {
    const { url, text } = msg.link;
    const link = {
      html: (c) => `🔗 <a href="${htmlAttr(url)}">${esc(c)}</a>`,
      gchat: (c) => `🔗 <${gchatUrl(url)}|${esc(c).replace(/\|/g, '¦')}>`,
      plain: (c) => `🔗 ${c}: ${url}`,
    }[flavor];
    out.push({ text: String(text), fmt: link, atomic: true });
  }
  return out;
}

export function render(msg, flavor) {
  return pieces(msg, flavor).map((p) => p.fmt(p.text)).join('\n');
}

/** Cut raw `text` into chunks whose rendered form `fmt(chunk)` fits in `limit` (never cuts inside markup/entities). */
function chunkRaw(text, fmt, limit) {
  const overhead = fmt('').length;
  const budget = limit - overhead;
  const chunks = [];
  let cur = '';
  let used = 0;
  for (const ch of text) {
    const cost = fmt(ch).length - overhead;
    if (cur && used + cost > budget) { chunks.push(cur); cur = ''; used = 0; }
    cur += ch;
    used += cost;
  }
  if (cur || !chunks.length) chunks.push(cur);
  return chunks.map(fmt);
}

/** Render a message as parts each ≤ `limit`, splitting raw text before markup is applied. */
export function renderParts(msg, flavor, limit) {
  const rendered = [];
  for (const p of pieces(msg, flavor)) {
    const r = p.fmt(p.text);
    if (r.length <= limit) rendered.push(r);
    else if (p.atomic && p.fmt('').length >= limit) rendered.push(...chunkRaw(`🔗 ${msg.link.text}: ${msg.link.url}`, ESC[flavor], limit));
    else rendered.push(...chunkRaw(p.text, p.fmt, limit));
  }
  const parts = [];
  let cur = null;
  for (const r of rendered) {
    if (cur !== null && cur.length + 1 + r.length <= limit) cur += `\n${r}`;
    else { if (cur !== null) parts.push(cur); cur = r; }
  }
  if (cur !== null) parts.push(cur);
  return parts;
}

/** Split plain text into parts ≤ `limit` on line boundaries; an over-long line is hard-cut. Nothing is dropped. */
export function splitText(text, limit) {
  const parts = [];
  let cur = null;
  const flush = () => { if (cur !== null) parts.push(cur); cur = null; };
  for (const line of String(text).split('\n')) {
    if (line.length > limit) {
      flush();
      let piece = '';
      for (const ch of line) {
        if (piece.length + ch.length > limit) { parts.push(piece); piece = ''; }
        piece += ch;
      }
      cur = piece;
    } else if (cur !== null && cur.length + 1 + line.length <= limit) cur += `\n${line}`;
    else { flush(); cur = line; }
  }
  flush();
  return parts;
}
