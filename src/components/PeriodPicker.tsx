import { type Period, MONTH_NAMES_LONG } from '@/lib/period';

interface PeriodPickerProps {
  value: Period;
  onChange: (p: Period) => void;
  /** Year range for the year dropdown. Defaults to value.year ± 5. */
  yearRange?: { from: number; to: number };
  /** Hide the month dropdown — used for year-only pickers (Budget editor). */
  yearOnly?: boolean;
  className?: string;
}

export function PeriodPicker({
  value,
  onChange,
  yearRange,
  yearOnly = false,
  className = '',
}: PeriodPickerProps) {
  const range = yearRange ?? { from: value.year - 5, to: value.year + 1 };
  const years: number[] = [];
  for (let y = range.from; y <= range.to; y++) years.push(y);

  const selectCls =
    'rounded-md border border-navy-200 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-navy-800 shadow-sm focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {!yearOnly && (
        <select
          value={value.month}
          onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
          className={selectCls}
        >
          {MONTH_NAMES_LONG.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      )}
      <select
        value={value.year}
        onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
        className={selectCls}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
