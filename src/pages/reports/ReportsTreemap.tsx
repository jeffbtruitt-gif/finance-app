/**
 * Per-group Spend Treemap cards — design-system layout:
 * title + "Area = proportion of spend", rounded treemap, white gutters,
 * centered category name + amount per tile (Figtree / Space Grotesk).
 */

import { useId, useMemo, useState } from 'react';
import type { ReportMonthGroup } from '@/features/reports/monthlyReportModel';
import {
  layoutSliceDiceTreemap,
  type TreemapLeafRect,
  type TreemapLeafInput,
} from '@/features/reports/treemapLayout';
import { fmtUsd } from '@/lib/money';

const VIEW_W = 560;
const VIEW_H = 252;
/** Inner padding before clipped treemap plot */
const PLOT_PAD = 12;
const CORNER_RX = 12;

type TreemapCell = TreemapLeafRect & { group: string };

function layoutGroupTreemap(group: ReportMonthGroup): TreemapCell[] {
  const leaves: TreemapLeafInput[] = group.items
    .filter((i) => i.actual > 0)
    .map((it) => ({
      id: it.id,
      name: it.name,
      value: it.actual,
      color: it.color,
    }));

  const plotW = VIEW_W - PLOT_PAD * 2;
  const plotH = VIEW_H - PLOT_PAD * 2;

  return layoutSliceDiceTreemap(leaves, PLOT_PAD, PLOT_PAD, plotW, plotH).map((r) => ({
    ...r,
    group: group.name,
  }));
}

function GroupTreemapCard({
  group,
  onDrillItem,
  onDrillGroup,
}: {
  group: ReportMonthGroup;
  onDrillItem: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const uid = useId().replace(/:/g, '');
  const clipId = `treemap-clip-${uid}`;
  const [hover, setHover] = useState<string | null>(null);
  const rects = useMemo(() => layoutGroupTreemap(group), [group]);
  const hasSpend = rects.length > 0;

  return (
    <div className="rounded-lg border border-navy-100 bg-white p-5 shadow-sm">
      <h3 className="text-h4 font-bold tracking-tight text-navy-900">Spend Treemap</h3>
      <p className="mt-1 text-caption text-gray-500">Area = proportion of spend</p>

      <button
        type="button"
        className="mt-4 block w-full text-left text-[11px] font-bold uppercase tracking-wider text-navy-700 hover:text-gold-600"
        onDoubleClick={() => onDrillGroup(group.drillKey, group.name)}
        title="Double-click to open Detail for this group"
      >
        {group.name}
      </button>

      <div className="mt-4 overflow-x-auto">
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block max-w-full"
          role="img"
          aria-label={`Spend treemap for ${group.name}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PLOT_PAD}
                y={PLOT_PAD}
                width={VIEW_W - PLOT_PAD * 2}
                height={VIEW_H - PLOT_PAD * 2}
                rx={CORNER_RX}
                ry={CORNER_RX}
              />
            </clipPath>
          </defs>

          {/* Plot backing — subtle neutral frame inside clip */}
          <rect
            x={PLOT_PAD}
            y={PLOT_PAD}
            width={VIEW_W - PLOT_PAD * 2}
            height={VIEW_H - PLOT_PAD * 2}
            rx={CORNER_RX}
            ry={CORNER_RX}
            fill="rgb(247 248 250)"
            stroke="rgb(226 229 236)"
            strokeWidth={1}
          />

          {!hasSpend && (
            <text
              x={VIEW_W / 2}
              y={VIEW_H / 2 + 4}
              textAnchor="middle"
              fill="rgb(113 120 137)"
              style={{ fontFamily: 'Figtree, Inter, system-ui, sans-serif', fontSize: 13 }}
            >
              No spending in this group this month
            </text>
          )}

          <g clipPath={`url(#${clipId})`}>
            {rects.map((r) => {
              const key = `${r.group}-${r.id}`;
              const dim = hover && hover !== key ? 0.72 : 1;
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              const showLabel = r.w >= 52 && r.h >= 46;

              return (
                <g key={key}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx={4}
                    ry={4}
                    fill={r.color}
                    opacity={dim}
                    stroke="white"
                    strokeWidth={2}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onDrillItem(r.id, r.name)}
                  />
                  {showLabel && (
                    <g pointerEvents="none">
                      <text
                        x={cx}
                        y={cy - 5}
                        textAnchor="middle"
                        fill="white"
                        style={{
                          fontFamily: 'Figtree, Inter, system-ui, sans-serif',
                          fontSize: 12,
                          fontWeight: 700,
                          paintOrder: 'stroke fill',
                          stroke: 'rgba(0,0,0,0.35)',
                          strokeWidth: 3,
                          strokeLinejoin: 'round',
                        }}
                      >
                        {r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name}
                      </text>
                      <text
                        x={cx}
                        y={cy + 12}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.92)"
                        style={{
                          fontFamily: "'Space Grotesk', Figtree, system-ui, sans-serif",
                          fontSize: 11,
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                          paintOrder: 'stroke fill',
                          stroke: 'rgba(0,0,0,0.28)',
                          strokeWidth: 2.5,
                          strokeLinejoin: 'round',
                        }}
                      >
                        {fmtUsd(r.value)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function ReportsTreemap(props: {
  groups: ReportMonthGroup[];
  onDrillItem: (id: string, name: string) => void;
  onDrillGroup: (drillKey: string, displayLabel: string) => void;
}) {
  const anySpend = useMemo(
    () => props.groups.some((g) => g.items.some((i) => i.actual > 0)),
    [props.groups],
  );

  if (!anySpend) {
    return (
      <div className="rounded-lg border border-navy-100 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-600">No spending in this month yet</p>
        <p className="mt-1 text-caption text-gray-500">
          Import transactions or pick another month to see treemaps by group.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {props.groups.map((g) => (
        <GroupTreemapCard
          key={g.drillKey}
          group={g}
          onDrillItem={props.onDrillItem}
          onDrillGroup={props.onDrillGroup}
        />
      ))}
    </div>
  );
}
