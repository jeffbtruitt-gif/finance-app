import { useEffect, useMemo, useRef, useState } from 'react';
import type { TransactionRow } from '@/types';

export type AmountDirection = 'all' | 'in' | 'out';

interface Props {
  align?: 'left' | 'right';
  active: boolean;
  minValue: number | null;
  maxValue: number | null;
  direction: AmountDirection;
  rows: TransactionRow[];
  onChange: (next: { min: number | null; max: number | null; dir: AmountDirection }) => void;
}

const HISTOGRAM_BINS = 40;
const HISTOGRAM_MAX = 8000;

export function AmountFilterPopover(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [minInput, setMinInput] = useState<string>(props.minValue?.toString() ?? '');
  const [maxInput, setMaxInput] = useState<string>(props.maxValue?.toString() ?? '');

  useEffect(() => setMinInput(props.minValue?.toString() ?? ''), [props.minValue]);
  useEffect(() => setMaxInput(props.maxValue?.toString() ?? ''), [props.maxValue]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onEsc);
    return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onEsc); };
  }, [open]);

  const histogram = useMemo(() => {
    const bins = new Array(HISTOGRAM_BINS).fill(0);
    for (const t of props.rows) {
      const a = Math.abs(t.amount);
      const idx = Math.min(HISTOGRAM_BINS - 1, Math.floor((a / HISTOGRAM_MAX) * HISTOGRAM_BINS));
      bins[idx]++;
    }
    const peak = Math.max(...bins, 1);
    return bins.map((b) => b / peak);
  }, [props.rows]);

  const commit = (min: string, max: string, dir: AmountDirection) => {
    const m = min === '' ? null : Number(min);
    const M = max === '' ? null : Number(max);
    props.onChange({ min: Number.isFinite(m) ? m : null, max: Number.isFinite(M) ? M : null, dir });
  };

  return (
    <div ref={ref} className="group relative inline-flex items-center gap-1">
      <span>Amount</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Filter by amount"
        aria-label="Filter by amount"
        aria-expanded={open}
        className={
          'rounded p-0.5 transition-colors ' +
          (props.active
            ? 'bg-navy-700 text-white'
            : 'text-gray-400 opacity-0 hover:bg-navy-100 hover:text-navy-800 group-hover:opacity-100 ' +
              (open ? '!opacity-100 bg-navy-100' : ''))
        }
      >
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor"><path d="M1 2h10l-4 5v3l-2 1V7L1 2z" /></svg>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={
            'absolute top-full z-30 mt-1 w-[280px] rounded-lg border border-navy-100 bg-white p-2 text-left text-sm normal-case tracking-normal text-navy-900 shadow-lg ' +
            (props.align === 'right' ? 'right-0' : 'left-0')
          }
        >
          <div className="mb-1.5 grid grid-cols-3 rounded-md border border-navy-100 bg-gray-50 p-0.5">
            {(['all', 'in', 'out'] as AmountDirection[]).map((k) => (
              <button
                key={k}
                onClick={() => commit(minInput, maxInput, k)}
                className={'rounded py-1 text-xs font-semibold ' + (props.direction === k ? 'bg-white text-navy-800 shadow-sm' : 'text-gray-600 hover:text-navy-800')}
              >
                {k === 'all' ? 'All' : k === 'in' ? 'Inflows' : 'Outflows'}
              </button>
            ))}
          </div>

          <div className="mb-1 flex h-10 items-end gap-px">
            {histogram.map((h, i) => {
              const binStart = (i / HISTOGRAM_BINS) * HISTOGRAM_MAX;
              const binEnd = ((i + 1) / HISTOGRAM_BINS) * HISTOGRAM_MAX;
              const lo = props.minValue ?? 0;
              const hi = props.maxValue ?? HISTOGRAM_MAX;
              const inRange = binEnd > lo && binStart < hi;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(2, h * 100)}%`,
                    backgroundColor: inRange ? '#2e437d' : '#bfcae3',
                  }}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                onBlur={() => commit(minInput, maxInput, props.direction)}
                placeholder="Min"
                inputMode="numeric"
                className="w-full rounded border border-navy-200 px-2 py-1 pl-5 text-sm num-tab"
              />
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={() => commit(minInput, maxInput, props.direction)}
                placeholder="Max"
                inputMode="numeric"
                className="w-full rounded border border-navy-200 px-2 py-1 pl-5 text-sm num-tab"
              />
            </div>
          </div>

          <div className="mt-2 flex gap-1">
            {(
              [
                [0, 50, '<$50'],
                [50, 250, '$50–250'],
                [250, 1000, '$250–1k'],
                [1000, null, '$1k+'],
              ] as Array<[number, number | null, string]>
            ).map(([lo, hi, label]) => (
              <button
                key={label}
                onClick={() => { setMinInput(String(lo)); setMaxInput(hi == null ? '' : String(hi)); commit(String(lo), hi == null ? '' : String(hi), props.direction); }}
                className="flex-1 rounded border border-navy-100 bg-gray-50 px-1.5 py-1 text-[10px] font-semibold text-navy-700 hover:bg-navy-50"
              >
                {label}
              </button>
            ))}
          </div>

          {(props.minValue != null || props.maxValue != null || props.direction !== 'all') && (
            <button
              onClick={() => { setMinInput(''); setMaxInput(''); commit('', '', 'all'); }}
              className="mt-2 w-full text-xs font-semibold text-navy-700 hover:underline"
            >
              Reset amount filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
