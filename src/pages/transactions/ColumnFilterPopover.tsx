import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  label: string;
  active?: boolean;
  /** Numeric badge next to the funnel (e.g. "3 accounts"). */
  count?: number;
  /** Anchor the popover panel to the left or right edge of the header. */
  align?: 'left' | 'right';
  children: ReactNode;
}

export function ColumnFilterPopover({ label, active = false, count, align = 'left', children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="group relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={`Filter by ${label}`}
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        className={
          'rounded p-0.5 transition-colors ' +
          (active
            ? 'bg-navy-700 text-white'
            : 'text-gray-400 opacity-0 hover:bg-navy-100 hover:text-navy-800 group-hover:opacity-100 ' +
              (open ? '!opacity-100 bg-navy-100' : ''))
        }
      >
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
          <path d="M1 2h10l-4 5v3l-2 1V7L1 2z" />
        </svg>
      </button>
      {active && count !== undefined && count > 0 && (
        <span className="rounded-full bg-navy-100 px-1.5 py-0 text-[9px] font-bold text-navy-800 num-tab">{count}</span>
      )}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={
            'absolute top-full z-30 mt-1 min-w-[220px] rounded-lg border border-navy-100 bg-white p-2 text-left text-sm normal-case tracking-normal text-navy-900 shadow-lg ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}
