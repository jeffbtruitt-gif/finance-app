/**
 * Slice-and-dice treemap layout — partitions a rectangle by value so tile areas
 * match spend proportions (design-system Spend Treemap pattern).
 */

export const TREEMAP_GUTTER_PX = 2;

export interface TreemapLeafInput {
  id: string;
  name: string;
  value: number;
  color: string;
}

export interface TreemapLeafRect extends TreemapLeafInput {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Recursive horizontal / vertical splits proportional to summed child weights.
 * Inserts `gutterPx` gaps between sibling partitions.
 */
export function layoutSliceDiceTreemap(
  items: TreemapLeafInput[],
  x: number,
  y: number,
  w: number,
  h: number,
  gutterPx: number = TREEMAP_GUTTER_PX,
): TreemapLeafRect[] {
  const nodes = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const sum = nodes.reduce((s, n) => s + n.value, 0);
  if (sum <= 0 || w < 8 || h < 8) return [];

  const g = gutterPx;

  if (nodes.length === 1) {
    const n = nodes[0];
    return [{ ...n, x: x + g / 2, y: y + g / 2, w: Math.max(0, w - g), h: Math.max(0, h - g) }];
  }

  let acc = 0;
  let split = 1;
  for (let i = 0; i < nodes.length - 1; i++) {
    acc += nodes[i].value;
    if (acc >= sum / 2) {
      split = i + 1;
      break;
    }
  }
  split = Math.max(1, Math.min(nodes.length - 1, split));

  const left = nodes.slice(0, split);
  const right = nodes.slice(split);
  const leftSum = left.reduce((s, n) => s + n.value, 0);
  const ratio = leftSum / sum;

  const minSeg = 24;

  if (w >= h) {
    let wL = w * ratio;
    wL = Math.min(Math.max(wL, minSeg), w - minSeg - g);
    let wR = w - wL - g;
    if (wR < minSeg) {
      wR = minSeg;
      wL = Math.max(minSeg, w - wR - g);
    }
    return [
      ...layoutSliceDiceTreemap(left, x, y, wL, h, g),
      ...layoutSliceDiceTreemap(right, x + wL + g, y, wR, h, g),
    ];
  }

  let hT = h * ratio;
  hT = Math.min(Math.max(hT, minSeg), h - minSeg - g);
  let hB = h - hT - g;
  if (hB < minSeg) {
    hB = minSeg;
    hT = Math.max(minSeg, h - hB - g);
  }
  return [
    ...layoutSliceDiceTreemap(left, x, y, w, hT, g),
    ...layoutSliceDiceTreemap(right, x, y + hT + g, w, hB, g),
  ];
}
