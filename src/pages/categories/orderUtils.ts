import type { CategoryRow as Cat } from '@/api/categories';

export function sortByOrder(cats: Cat[]): Cat[] {
  return [...cats].sort((a, b) => a.sort_order - b.sort_order);
}

/** Replace visible rows in `fullSorted` with `newVisibleOrdered` (same ids, new order + patches). */
export function rebuildFullOrderAfterVisibleReorder(
  fullSorted: Cat[],
  newVisibleOrdered: Cat[],
): Cat[] {
  const visIds = new Set(newVisibleOrdered.map((c) => c.id));
  const q = [...newVisibleOrdered];
  return fullSorted.map((c) => (visIds.has(c.id) ? q.shift()! : c));
}
