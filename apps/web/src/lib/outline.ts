export interface Heading { level: number; title: string; index: number }
export interface OutlineEntry extends Heading { children: OutlineEntry[] }

// A heading belongs to the nearest preceding heading with a lower level.
// Skipped levels do not create empty placeholder nodes.
export function buildOutline(headings: readonly Heading[]): OutlineEntry[] {
  const roots: OutlineEntry[] = [];
  const stack: OutlineEntry[] = [];
  for (const heading of headings) {
    const node: OutlineEntry = { ...heading, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(node);
    stack.push(node);
  }
  return roots;
}
