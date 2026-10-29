import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateConfig, loadConfig, noteDirs, DEFAULT_CONFIG } from '../kit/scripts/lib/config.mjs';

const base = () => ({ kitVersion: '1.0.0', sides: { be: 'BE', fe: 'FE' }, strict: { since: '2026-01-01' } });
const withP = (patch) => {
  const c = base();
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let o = c;
    for (const p of parts.slice(0, -1)) o = o[p] ??= {};
    if (v === undefined) delete o[parts.at(-1)]; else o[parts.at(-1)] = v;
  }
  return c;
};

test('accepts minimal config', () => {
  const r = validateConfig(base());
  assert.deepEqual(r.errors, []);
  assert.equal(r.config.notify.channel, 'none');
  assert.equal(r.config.notify.remindMaxItems, 5);
  assert.equal(DEFAULT_CONFIG.lang, 'en');
});

const bad = [
  ['side id Be', { sides: { Be: 'BE', fe: 'FE' } }, 'sides.Be'],
  ['paused not in sides', { paused: ['x'] }, 'paused'],
  ['contract glob side missing', { 'contract.globs': { qa: ['a/**'] } }, 'contract.globs.qa'],
  ['manager side missing', { 'notify.managers': { x: ['@a'] } }, 'notify.managers.x'],
  ['duplicate module dir', { modules: { a: 'same', b: 'same' } }, 'modules'],
  ['lang', { lang: 'fr' }, 'lang'],
  ['topology mesh', { topology: 'mesh' }, 'topology'],
  ['topology hub', { topology: 'hub' }, 'v1.1'],
  ['channel slack', { 'notify.channel': 'slack' }, 'v1.1'],
  ['channel discord', { 'notify.channel': 'discord' }, 'notify.channel'],
  ['strict.since format', { 'strict.since': '28/10' }, 'strict.since'],
  ['strict.since missing', { 'strict.since': undefined }, 'strict.since'],
  ['kitVersion missing', { kitVersion: undefined }, 'kitVersion'],
  ['one side', { sides: { be: 'BE' } }, 'sides'],
  ['siteUrl ftp', { 'notify.siteUrl': 'ftp://x' }, 'notify.siteUrl'],
];
for (const [name, patch, needle] of bad) {
  test(`rejects ${name}`, () => {
    const r = validateConfig(withP(patch));
    assert.equal(r.config, null);
    assert.ok(r.errors.some((e) => e.includes(needle)), `${needle} not in ${JSON.stringify(r.errors)}`);
  });
}

test('rejects non-object', () => {
  assert.equal(validateConfig(null).config, null);
});
test('accepts channel gchat without managers', () => {
  assert.deepEqual(validateConfig(withP({ 'notify.channel': 'gchat' })).errors, []);
});
test('accepts siteUrl https and empty', () => {
  assert.deepEqual(validateConfig(withP({ 'notify.siteUrl': 'https://x.dev/n' })).errors, []);
  assert.deepEqual(validateConfig(withP({ 'notify.siteUrl': '' })).errors, []);
});
test('flat modules -> noteDirs = [notes]; modules -> dirs', () => {
  assert.deepEqual(noteDirs(validateConfig(base()).config), ['notes']);
  assert.deepEqual(noteDirs(validateConfig(withP({ modules: { billing: 'billing' } })).config), ['billing']);
});
test('loadConfig reads CRLF + BOM file; missing file throws with errors', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'cfg-'));
  assert.throws(() => loadConfig(d), (e) => e.errors.some((m) => m.includes('sync.config.json')));
  writeFileSync(path.join(d, 'sync.config.json'), '\uFEFF' + JSON.stringify(base(), null, 2).replace(/\n/g, '\r\n'));
  assert.equal(loadConfig(d).sides.fe, 'FE');
  writeFileSync(path.join(d, 'sync.config.json'), '{ nope');
  assert.throws(() => loadConfig(d), (e) => e.errors[0].includes('sync.config.json'));
  writeFileSync(path.join(d, 'sync.config.json'), JSON.stringify({ ...base(), lang: 'fr' }));
  assert.throws(() => loadConfig(d), (e) => e.errors.some((m) => m.includes('lang')));
});
