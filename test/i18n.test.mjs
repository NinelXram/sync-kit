import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t } from '../kit/scripts/lib/i18n.mjs';

const load = (l) => JSON.parse(readFileSync(new URL(`../kit/scripts/i18n/${l}.json`, import.meta.url), 'utf8'));

test('en and vi have identical key sets', () => {
  assert.deepEqual(Object.keys(load('en')).sort(), Object.keys(load('vi')).sort());
});
test('t replaces vars', () => {
  assert.match(t('en', 'inbox.counts', { open: 3, closed: 4 }), /\*\*3\*\*.*\*\*4\*\*/);
  assert.match(t('vi', 'inbox.counts', { open: 3, closed: 4 }), /Đang mở: \*\*3\*\*/);
});
test('t throws on missing key', () => assert.throws(() => t('en', 'nope.key'), /missing key/));
test('t throws on unknown lang', () => assert.throws(() => t('xx', 'inbox.title'), /unknown language/));
