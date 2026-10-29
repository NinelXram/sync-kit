import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../kit/scripts/lib/frontmatter.mjs';

const SRC = '---\nid: a\ntitle: "a: b"\nrefs: [A-1, "PR-2"]\ntargets:\n  fe: pending\n---\nbody\n';

test('parses scalar, quoted, list, one-level map', () => {
  assert.deepEqual(parseFrontmatter(SRC), {
    id: 'a', title: 'a: b', refs: ['A-1', 'PR-2'], targets: { fe: 'pending' },
  });
});
test('parses CRLF + BOM', () => {
  assert.deepEqual(parseFrontmatter('\uFEFF' + SRC.replace(/\n/g, '\r\n')), parseFrontmatter(SRC));
});
test('returns null without frontmatter', () => {
  assert.equal(parseFrontmatter('# hi\n'), null);
});
test('ignores # comment lines', () => {
  assert.deepEqual(parseFrontmatter('---\n# c\nid: a\n---\n'), { id: 'a' });
});
test('unescapes double-quoted scalars', () => {
  const m = parseFrontmatter('---\ntitle: "Add \\"status\\" field \\\\ x"\n---\n');
  assert.equal(m.title, 'Add "status" field \\ x');
});
test('unescapes single-quoted doubled quote', () => {
  assert.equal(parseFrontmatter("---\ntitle: 'it''s'\n---\n").title, "it's");
});
