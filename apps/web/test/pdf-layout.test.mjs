import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageAtOffset, pageOffsets } from '../src/lib/pdf-layout.ts';
test('mixed page sizes and gaps map to bounded virtual page indices', () => {
  const offsets = pageOffsets([1.4, 0.7, 2], 600);
  assert.deepEqual(offsets, [0, 856, 1292, 2508]);
  for (const [top, index] of [[-1, 0], [855, 0], [856, 1], [1292, 2], [99999, 2]]) {
    assert.equal(pageAtOffset(offsets, top), index);
  }
  assert.equal(pageAtOffset([0], 0), 0);
});
