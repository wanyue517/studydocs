/** Prefix offsets keep mixed portrait/landscape pages in one virtual scrollport. */
export function pageOffsets(ratios: readonly number[], width: number): number[] {
  const offsets = [0];
  for (const ratio of ratios) offsets.push(offsets[offsets.length - 1] + Math.max(1, width * ratio) + 16);
  return offsets;
}
export function pageAtOffset(offsets: readonly number[], top: number): number {
  let low = 0, high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= top) low = mid; else high = mid - 1;
  }
  return low;
}
