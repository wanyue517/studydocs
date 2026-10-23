import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutline } from '../src/lib/outline.ts';

const heading = (level, title, index) => ({ level, title, index });
test('nested levels, skipped levels and a new root preserve document order and targets', () => {
  const source = [heading(1, 'A', 0), heading(2, 'B', 1), heading(4, 'C', 2), heading(6, 'D', 3), heading(2, 'E', 4), heading(1, 'F', 5)];
  const before = structuredClone(source);
  const result = buildOutline(source);
  assert.deepEqual(result.map(x => x.title), ['A', 'F']);
  assert.deepEqual(result[0].children.map(x => x.title), ['B', 'E']);
  assert.equal(result[0].children[0].children[0].title, 'C');
  assert.equal(result[0].children[0].children[0].children[0].index, 3);
  assert.deepEqual(result[1].children, []);
  assert.deepEqual(source, before);
});
test('a document starting with H3 has no invented parents and repeated titles keep unique targets', () => {
  const result = buildOutline([heading(3, 'Same', 0), heading(4, 'Same', 1), heading(2, 'Same', 2)]);
  assert.deepEqual(result.map(x => x.index), [0, 2]);
  assert.equal(result[0].children[0].index, 1);
  assert.deepEqual(buildOutline([]), []);
});
