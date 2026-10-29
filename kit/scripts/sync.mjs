#!/usr/bin/env node
// sync-kit engine entry. Run from the repo root:  node sync/scripts/sync.mjs <command> [--flags]
// Commands: install | state | init | new | inbox | check | contract-check | notify | remind | agent-rules | doctor | version  (add more with one line in COMMANDS below)

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/io.mjs';
import { loadConfig } from './lib/config.mjs';

// command name -> module (default export: async (args, ctx) => exitCode)
const COMMANDS = {
  install: './lib/commands/install.mjs',
  state: './lib/commands/state.mjs',
  init: './lib/commands/init.mjs',
  new: './lib/commands/new.mjs',
  inbox: './lib/commands/inbox.mjs',
  check: './lib/commands/check.mjs',
  'contract-check': './lib/commands/contract-check.mjs',
  notify: './lib/commands/notify.mjs',
  remind: './lib/commands/remind.mjs',
  'agent-rules': './lib/commands/agent-rules.mjs',
  doctor: './lib/commands/doctor.mjs',
  version: './lib/commands/version.mjs',
};
// these run before a valid config exists (doctor reports a bad config as a failed check)
const NO_CONFIG = new Set(['version', 'install', 'state', 'doctor']);

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !Object.hasOwn(COMMANDS, cmd)) {
  console.error(`Usage: node sync/scripts/sync.mjs <${Object.keys(COMMANDS).join('|')}> [--flags]`);
  process.exit(2);
}

const args = parseArgs(rest);
const syncDir = typeof args['sync-dir'] === 'string'
  ? resolve(process.cwd(), args['sync-dir'])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(syncDir, '..');

let config = null;
if (!NO_CONFIG.has(cmd)) {
  try {
    config = loadConfig(syncDir);
  } catch (e) {
    for (const m of e.errors ?? [e.message]) console.error(`error: ${m}`);
    console.error('hint: create/fix sync/sync.config.json by running phase 01 (prompts/01-install.md).');
    process.exit(1);
  }
}

const mod = await import(new URL(COMMANDS[cmd], import.meta.url));
process.exitCode = await mod.default(args, { syncDir, repoRoot, config, argv: rest });
