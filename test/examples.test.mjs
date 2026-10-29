import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../kit/scripts/lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = readFileSync(path.join(ROOT, 'kit', 'scripts', 'VERSION'), 'utf8').trim();
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'repos');
const FIXTURE_NAMES = ['monorepo-node', 'single-python', 'legacy'];

test('examples/*.config.json all valid', () => {
  const dir = path.join(ROOT, 'examples');
  const files = readdirSync(dir).filter((f) => f.endsWith('.config.json'));
  assert.ok(files.length >= 2, 'expected at least 2 example configs');
  for (const f of files) {
    const { errors } = validateConfig(readJson(path.join(dir, f)));
    assert.deepEqual(errors, [], f);
    assert.equal(readJson(path.join(dir, f)).kitVersion, VERSION, `${f}: kitVersion`);
  }
});

test('e2e fixtures: expected/sync.config.json valid and matches decisions', () => {
  for (const name of FIXTURE_NAMES) {
    const exp = path.join(FIXTURES, name, 'expected');
    const cfgFile = path.join(exp, 'sync.config.json');
    assert.ok(existsSync(cfgFile), `${name}: missing expected/sync.config.json`);
    const raw = readJson(cfgFile);
    const { config, errors } = validateConfig(raw);
    assert.deepEqual(errors, [], name);
    assert.equal(config.kitVersion, VERSION, `${name}: kitVersion`);
    const d = readJson(path.join(exp, 'decisions.json'));
    assert.equal(d.topology, config.topology, `${name}: topology`);
    assert.equal(d.channel, config.notify.channel, `${name}: channel`);
    assert.equal(d.lang, config.lang, `${name}: lang`);
  }
});

test('e2e fixtures contain no test files', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const bad = walk(FIXTURES).filter((f) => f.endsWith('.test.mjs'));
  assert.deepEqual(bad, []);
});
