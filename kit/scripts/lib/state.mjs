import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readText, writeText, localDate } from './io.mjs';

// sync/.kit/state.json — installation progress + decisions. Written only through `sync.mjs state`.
export const PHASES = ['00', '01', '02', '03', '04', '05'];
const PHASE_STATUSES = ['done', 'skipped'];
const DECISION_KEYS = ['topology', 'ci', 'agentFiles', 'channel', 'lang'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const statePath = (syncDir) => join(syncDir, '.kit', 'state.json');

export function stateError(errors) {
  const e = new Error(`invalid state:\n- ${errors.join('\n- ')}`);
  e.errors = errors;
  return e;
}

/** Parsed state.json, or null when missing. Throws on invalid JSON. */
export function loadState(syncDir) {
  const file = statePath(syncDir);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readText(file)); } catch (e) { throw stateError([`state.json: invalid JSON (${e.message})`]); }
}

/** Validation errors for a raw state object ([] = valid). Decisions may be partial (filled in step by step). */
export function validateState(raw) {
  if (!isObj(raw)) return ['state: must be a JSON object'];
  const errors = [];
  const err = (m) => errors.push(m);
  if (typeof raw.kitVersion !== 'string' || !raw.kitVersion) err('kitVersion: required (string)');
  if (typeof raw.kitRef !== 'string' || !raw.kitRef) err('kitRef: required (string, e.g. a tag "v1.0.0")');

  if (!isObj(raw.phases)) err('phases: must be an object');
  else for (const [k, v] of Object.entries(raw.phases)) {
    if (!PHASES.includes(k)) { err(`phases.${k}: unknown phase (use ${PHASES.join(', ')})`); continue; }
    if (!isObj(v) || !PHASE_STATUSES.includes(v.status)) err(`phases.${k}.status: must be "done" or "skipped"`);
    if (!isObj(v) || typeof v.at !== 'string' || !DATE_RE.test(v.at)) err(`phases.${k}.at: must be YYYY-MM-DD`);
  }

  const d = raw.decisions;
  if (!isObj(d)) err('decisions: must be an object');
  else {
    for (const k of Object.keys(d)) if (!DECISION_KEYS.includes(k)) err(`decisions.${k}: unknown key`);
    if ('topology' in d) {
      if (d.topology === 'hub') err('decisions.topology: "hub" is not supported until v1.1 (use "monorepo" or "single")');
      else if (!['monorepo', 'single'].includes(d.topology)) err(`decisions.topology: must be "monorepo" or "single" (got ${JSON.stringify(d.topology)})`);
    }
    if ('ci' in d && !['github', 'gitlab', 'none'].includes(d.ci)) err(`decisions.ci: must be "github", "gitlab" or "none" (got ${JSON.stringify(d.ci)})`);
    if ('channel' in d) {
      if (d.channel === 'slack' || d.channel === 'discord') err(`decisions.channel: "${d.channel}" is not supported until v1.1 (use "telegram", "gchat" or "none")`);
      else if (!['telegram', 'gchat', 'none'].includes(d.channel)) err(`decisions.channel: must be "telegram", "gchat" or "none" (got ${JSON.stringify(d.channel)})`);
    }
    if ('agentFiles' in d && !(Array.isArray(d.agentFiles) && d.agentFiles.every((f) => typeof f === 'string' && f))) err('decisions.agentFiles: must be an array of repo-relative paths');
    if ('lang' in d && !['en', 'vi'].includes(d.lang)) err(`decisions.lang: must be "en" or "vi" (got ${JSON.stringify(d.lang)})`);
    if (d.ci === 'none' && 'channel' in d && d.channel !== 'none') err(`decisions.channel: notifications require CI — with ci "none" the channel must be "none" (got ${JSON.stringify(d.channel)})`);
  }
  return errors;
}

/** Stable key order so repeated writes are byte-identical. */
function normalize(s) {
  const phases = {};
  for (const k of PHASES) if (s.phases[k]) phases[k] = { status: s.phases[k].status, at: s.phases[k].at };
  const decisions = {};
  for (const k of DECISION_KEYS) if (k in s.decisions) decisions[k] = s.decisions[k];
  return { kitVersion: s.kitVersion, kitRef: s.kitRef, phases, decisions };
}

/** Validate then write; throws (writing nothing) when invalid. */
export function saveState(syncDir, state) {
  const errors = validateState(state);
  if (errors.length) throw stateError(errors);
  const text = `${JSON.stringify(normalize(state), null, 2)}\n`;
  const file = statePath(syncDir);
  if (!existsSync(file) || readText(file) !== text) writeText(file, text);
  return text;
}

function mustLoad(syncDir) {
  const s = loadState(syncDir);
  if (!s) throw stateError(['state.json not found — run `state init --kit-ref <tag>` first']);
  if (!isObj(s.phases)) s.phases = {};
  if (!isObj(s.decisions)) s.decisions = {};
  return s;
}

/** Create the state (or refresh kitVersion/kitRef, keeping phases and decisions). */
export function initState(syncDir, { kitVersion, kitRef }) {
  const cur = loadState(syncDir);
  const base = isObj(cur) ? cur : {};
  return saveState(syncDir, {
    kitVersion,
    kitRef,
    phases: isObj(base.phases) ? base.phases : {},
    decisions: isObj(base.decisions) ? base.decisions : {},
  });
}

export function setPhase(syncDir, phase, status) {
  const s = mustLoad(syncDir);
  if (!PHASES.includes(phase)) throw stateError([`phase: must be one of ${PHASES.join(', ')} (got ${JSON.stringify(phase)})`]);
  s.phases = { ...s.phases, [phase]: { status, at: localDate() } };
  return saveState(syncDir, s);
}

export function setDecisions(syncDir, partial) {
  const s = mustLoad(syncDir);
  s.decisions = { ...s.decisions, ...partial };
  return saveState(syncDir, s);
}
