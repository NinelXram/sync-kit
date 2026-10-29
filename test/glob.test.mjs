import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matchAny } from '../kit/scripts/lib/glob.mjs';

test('** / matches zero or more directories', () => {
  const re = globToRegExp('backend/**/*.dto.ts');
  assert.ok(re.test('backend/a/b/x.dto.ts'));
  assert.ok(re.test('backend/x.dto.ts'));
  assert.ok(!re.test('backend/x.dto.tsx'));
});
test('* does not cross /', () => {
  assert.ok(!globToRegExp('*.proto').test('a/b.proto'));
  assert.ok(globToRegExp('*.proto').test('b.proto'));
});
test('? and escaping', () => {
  assert.ok(globToRegExp('a?.ts').test('ab.ts'));
  assert.ok(!globToRegExp('a.ts').test('axts'));
});
test('matchAny', () => {
  assert.ok(matchAny(['*.proto', 'x/**'], 'x/y/z'));
  assert.ok(!matchAny([], 'x'));
});
