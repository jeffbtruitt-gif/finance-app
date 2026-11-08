import { useMemo } from 'react';
import { CategoryChip } from '@/components/ds';
import type { CategoryOption } from '@/api/transactions';

/**
 * Row of one-click category chips for categories flagged "quick assign"
 * (same look as the Make rule modal). Renders nothing when none are flagged.
 */
export function QuickAssignChips(props: {
  categories: CategoryOption[];
  selectedId?: string;
  disabled?: boolean;
  onPick: (categoryId: string) => void;
  hint?: string;
  className?: string;
}) {
  const { categories, selectedId, disabled, onPick, hint, className = '' } = props;

  const quick = useMemo(
    () =>
      [...categories].filter((c) => c.quick_assign).sort((a, b) => a.sort_order - b.sort_order),
    [categories],
  );

  if (quick.length === 0) return null;

  return (
    <div className={className}>
      <span className="text-label text-gray-600">Quick assign</span>
      {hint && <p className="text-caption mt-0.5 text-gray-500">{hint}</p>}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {quick.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.id)}
            className={`rounded-full border p-0 shadow-sm transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-45 ${
              selectedId === c.id
                ? 'border-navy-500 ring-2 ring-navy-300'
                : 'border-navy-100 bg-white'
            }`}
            aria-label={`Set category to ${c.name}`}
            aria-pressed={selectedId === c.id}
          >
            <CategoryChip name={c.name} className="!px-2.5 !py-1 !text-xs" />
          </button>
        ))}
      </div>
    </div>
  );
}
