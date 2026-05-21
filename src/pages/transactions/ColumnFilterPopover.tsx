import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (align === 'right') {
      setPos({ top: rect.bottom + 4, left: rect.right });
    } else {
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll() {
      reposition();
    }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition]);

  return (
    <div ref={wrapRef} className="group relative inline-flex items-center gap-1">
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
      {open && pos && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            ...(align === 'right' ? { right: window.innerWidth - pos.left } : { left: pos.left }),
            zIndex: 50,
          }}
          className="min-w-[220px] rounded-lg border border-navy-100 bg-white p-2 text-left text-sm normal-case tracking-normal text-navy-900 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
