import type { Rule, RuleCondition } from '@/types/phase2';
import { Badge, CategoryChip } from '@/components/ds';
import { IconClose, IconDrag, IconEdit, IconTrash } from './rulesIcons';
import { conditionValueSnippet, opLabel } from './rulesShared';

export function RuleRow(props: {
  rule: Rule;
  index: number;
  total: number;
  matchCount: number;
  expanded: boolean;
  selected: boolean;
  categoryName: string;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const {
    rule,
    index,
    total,
    matchCount,
    expanded,
    selected,
    categoryName,
    onToggleExpand,
    onToggleSelect,
    onMove,
    onToggleActive,
    onDelete,
  } = props;

  const idxLabel = String(index + 1).padStart(2, '0');

  return (
    <div
      className={`group relative border-b border-navy-100 transition-colors last:border-b-0 ${
        expanded ? 'bg-navy-50/60' : selected ? 'bg-navy-50/40' : 'bg-white hover:bg-gray-50'
      } ${rule.is_active ? '' : 'opacity-60'}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label="Move rule up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="text-[10px] text-gray-400 hover:text-navy-800 disabled:opacity-30"
          >
            ▲
          </button>
          <IconDrag className="cursor-grab text-gray-300 group-hover:text-navy-700" />
          <button
            type="button"
            aria-label="Move rule down"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
            className="text-[10px] text-gray-400 hover:text-navy-800 disabled:opacity-30"
          >
            ▼
          </button>
        </div>

        <span className="w-5 text-right font-mono text-[10px] tabular-nums text-gray-400">
          {idxLabel}
        </span>

        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select rule ${rule.name}`}
          className="h-4 w-4 shrink-0 rounded border-gray-300 accent-navy-700"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-navy-900">{rule.name}</span>
            {!rule.is_active && <Badge tone="neutral">Disabled</Badge>}
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              {matchCount} matches
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-gray-600">
            {rule.conditions.map((c: RuleCondition, i: number) => (
              <span key={i} className="inline-flex flex-wrap items-center gap-1.5">
                {i > 0 && <span className="text-gray-400">AND</span>}
                <span className="font-mono text-gray-500">{c.field}</span>
                <span className="text-gray-400">{opLabel(c)}</span>
                <code className="font-mono rounded border border-navy-100 bg-navy-50 px-1.5 py-0.5 text-[11px] text-navy-700">
                  {conditionValueSnippet(c)}
                </code>
              </span>
            ))}
            <span className="text-gray-300">→</span>
            <CategoryChip name={categoryName} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-7 w-7 items-center justify-center rounded-md text-navy-700 hover:bg-navy-100"
            title={expanded ? 'Close' : 'Edit'}
          >
            {expanded ? <IconClose /> : <IconEdit />}
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            className="h-7 px-2 text-[12px] font-medium text-gray-600 hover:bg-gray-100"
          >
            {rule.is_active ? 'Disable' : 'Enable'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neg hover:bg-neg-soft"
            title="Delete"
          >
            <IconTrash />
          </button>
        </div>
      </div>
    </div>
  );
}
