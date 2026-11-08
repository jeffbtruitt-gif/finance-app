import { useMemo } from 'react';
import { CategoryChip } from '@/components/ds';
import { ALL_GROUPS } from '@/features/categories/constants';

/**
 * Shared category picking pieces so every category dropdown in the app looks
 * and orders the same way:
 *  - groups in the canonical ALL_GROUPS order (unknown groups A–Z, ungrouped last)
 *  - categories inside a group by sort_order
 *  - optional "Quick assign" chip row for categories flagged quick_assign
 *
 * NOTE: don't wrap <CategorySelect> (or <QuickAssignChips>) in a <label>:
 * a label forwards clicks on its text to its first button, i.e. the first chip.
 */

export type PickableCategory = {
  id: string;
  name: string;
  group_name?: string | null;
  sort_order?: number;
  quick_assign?: boolean;
};

export const CATEGORY_PLACEHOLDER = 'Select category…';
const UNGROUPED = 'Ungrouped';

export function groupCategories<T extends PickableCategory>(
  categories: T[],
): { label: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const c of categories) {
    const key = c.group_name?.trim() || UNGROUPED;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  const rank = (g: string) => {
    if (g === UNGROUPED) return Number.MAX_SAFE_INTEGER;
    const i = ALL_GROUPS.indexOf(g as (typeof ALL_GROUPS)[number]);
    return i >= 0 ? i : ALL_GROUPS.length;
  };
  const keys = [...m.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return keys.map((k) => ({
    label: k,
    items: [...m.get(k)!].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));
}

export function quickAssignCategories<T extends PickableCategory>(categories: T[]): T[] {
  return categories
    .filter((c) => c.quick_assign)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** <optgroup>s for a native <select>, in the shared order. */
export function CategoryOptions({ categories }: { categories: PickableCategory[] }) {
  const groups = useMemo(() => groupCategories(categories), [categories]);
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Row of one-click chips for quick-assign categories. Renders nothing if none are flagged. */
export function QuickAssignChips(props: {
  categories: PickableCategory[];
  selectedId?: string;
  disabled?: boolean;
  onPick: (categoryId: string) => void;
  hint?: string;
  className?: string;
}) {
  const { categories, selectedId, disabled, onPick, hint, className = '' } = props;
  const quick = useMemo(() => quickAssignCategories(categories), [categories]);
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

/**
 * Standard category dropdown: optional quick-assign chips on top, then a
 * grouped native select.
 */
export function CategorySelect(props: {
  categories: PickableCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  /** Text of the empty option. Pass e.g. "Uncategorized" where clearing is meaningful. */
  placeholder?: string;
  disabled?: boolean;
  quickAssign?: boolean;
  label?: string;
  className?: string;
  selectClassName?: string;
  chipsClassName?: string;
}) {
  const {
    categories,
    value,
    onChange,
    placeholder = CATEGORY_PLACEHOLDER,
    disabled,
    quickAssign = true,
    label = 'Category',
    className = '',
    selectClassName = 'w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-200',
    chipsClassName = 'mb-2',
  } = props;

  return (
    <div className={className}>
      {quickAssign && (
        <QuickAssignChips
          categories={categories}
          selectedId={value}
          disabled={disabled}
          onPick={onChange}
          className={chipsClassName}
        />
      )}
      <select
        aria-label={label}
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        <CategoryOptions categories={categories} />
      </select>
    </div>
  );
}
