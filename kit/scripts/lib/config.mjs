import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readText } from './io.mjs';

export const DEFAULT_CONFIG = {
  lang: 'en',
  topology: 'monorepo',
  paused: [],
  modules: {},
  inbox: { commit: true },
  contract: { globs: {} },
  strict: { enabled: true }, // strict.since is required (no default)
  notify: { channel: 'none', managers: {}, remindMaxItems: 5, siteUrl: '' },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(def, raw) {
  const out = { ...def };
  for (const [k, v] of Object.entries(raw)) {
    out[k] = isObj(v) && isObj(def[k]) ? merge(def[k], v) : v;
  }
  return out;
}

const SIDE_RE = /^[a-z][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isStrArr = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function validateConfig(raw) {
  if (!isObj(raw)) return { config: null, errors: ['config: must be a JSON object'] };
  const c = merge(DEFAULT_CONFIG, raw);
  const errors = [];
  const err = (m) => errors.push(m);

  if (typeof c.kitVersion !== 'string' || !c.kitVersion) err('kitVersion: required (string, e.g. "1.0.0")');
  if (!['en', 'vi'].includes(c.lang)) err(`lang: must be "en" or "vi" (got ${JSON.stringify(c.lang)})`);
  if (c.topology === 'hub') err('topology: "hub" is not supported until v1.1 (use "monorepo" or "single")');
  else if (!['monorepo', 'single'].includes(c.topology)) err(`topology: must be "monorepo" or "single" (got ${JSON.stringify(c.topology)})`);

  let sideIds = [];
  if (!isObj(c.sides)) err('sides: must be an object of id -> label');
  else {
    sideIds = Object.keys(c.sides);
    for (const [id, label] of Object.entries(c.sides)) {
      if (!SIDE_RE.test(id)) err(`sides.${id}: id must match ${SIDE_RE}`);
      if (typeof label !== 'string' || !label) err(`sides.${id}: label must be a non-empty string`);
    }
    if (sideIds.length < 2) err('sides: need at least 2 sides');
  }

  if (!isStrArr(c.paused)) err('paused: must be an array of side ids');
  else for (const p of c.paused) if (!sideIds.includes(p)) err(`paused: "${p}" is not a key of sides`);

  if (!isObj(c.modules)) err('modules: must be an object of name -> dir');
  else {
    const seen = new Map();
    for (const [name, dir] of Object.entries(c.modules)) {
      if (typeof dir !== 'string' || !dir) { err(`modules.${name}: dir must be a non-empty string`); continue; }
      if (seen.has(dir)) err(`modules: duplicate dir "${dir}" (${seen.get(dir)}, ${name})`);
      else seen.set(dir, name);
    }
  }

  if (!isObj(c.inbox) || typeof c.inbox.commit !== 'boolean') err('inbox.commit: must be a boolean');

  if (!isObj(c.contract) || !isObj(c.contract.globs)) err('contract.globs: must be an object of side -> globs[]');
  else for (const [side, globs] of Object.entries(c.contract.globs)) {
    if (!sideIds.includes(side)) err(`contract.globs.${side}: "${side}" is not a key of sides`);
    if (!isStrArr(globs)) err(`contract.globs.${side}: must be an array of strings`);
  }

  if (!isObj(c.strict)) err('strict: must be an object');
  else {
    if (typeof c.strict.enabled !== 'boolean') err('strict.enabled: must be a boolean');
    if (typeof c.strict.since !== 'string' || !DATE_RE.test(c.strict.since)) err('strict.since: required, format YYYY-MM-DD');
  }

  if (!isObj(c.notify)) err('notify: must be an object');
  else {
    const n = c.notify;
    if (n.channel === 'slack' || n.channel === 'discord') err(`notify.channel: "${n.channel}" is not supported until v1.1 (use "telegram", "gchat" or "none")`);
    else if (!['telegram', 'gchat', 'none'].includes(n.channel)) err(`notify.channel: must be "telegram", "gchat" or "none" (got ${JSON.stringify(n.channel)})`);
    if (!isObj(n.managers)) err('notify.managers: must be an object of side -> handles[]');
    else for (const [side, hs] of Object.entries(n.managers)) {
      if (!sideIds.includes(side)) err(`notify.managers.${side}: "${side}" is not a key of sides`);
      if (!isStrArr(hs)) err(`notify.managers.${side}: must be an array of strings`);
    }
    if (!Number.isInteger(n.remindMaxItems) || n.remindMaxItems < 1) err('notify.remindMaxItems: must be a positive integer');
    if (typeof n.siteUrl !== 'string' || (n.siteUrl !== '' && !/^https?:\/\//.test(n.siteUrl))) err('notify.siteUrl: must be empty or start with http:// or https://');
  }

  return errors.length ? { config: null, errors } : { config: c, errors: [] };
}

function fail(errors) {
  const e = new Error(`Invalid sync.config.json:\n- ${errors.join('\n- ')}`);
  e.errors = errors;
  return e;
}

export function loadConfig(syncDir) {
  const file = join(syncDir, 'sync.config.json');
  if (!existsSync(file)) throw fail([`sync.config.json not found in ${syncDir}`]);
  let raw;
  try { raw = JSON.parse(readText(file)); } catch (e) { throw fail([`sync.config.json: invalid JSON (${e.message})`]); }
  const { config, errors } = validateConfig(raw);
  if (!config) throw fail(errors);
  return config;
}

export function noteDirs(config) {
  const dirs = Object.values(config.modules);
  return dirs.length ? dirs : ['notes'];
}
