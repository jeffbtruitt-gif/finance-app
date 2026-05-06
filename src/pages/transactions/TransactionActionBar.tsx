import { Button } from '@/components/ds';

export function TransactionActionBar(props: {
  variant: 'floating' | 'inline';
  count: number;
  onCategorize: () => void;
  onMakeRule: () => void;
  onTrip: () => void;
  onTag: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { variant, count, onCategorize, onMakeRule, onTrip, onTag, onDelete, onClear } = props;

  const wrap =
    variant === 'inline'
      ? 'flex w-full flex-wrap items-center gap-2'
      : 'flex flex-wrap items-center gap-2';

  const inner = (
    <>
      <span className="flex items-center gap-2 pr-2">
        <span className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-navy-900">
          {count}
        </span>
        <span className="text-sm font-medium text-white">selected</span>
      </span>
      <Button
        variant="accent"
        size="sm"
        className="!bg-gold-500 !text-navy-900 hover:!bg-gold-400"
        onClick={onCategorize}
      >
        Set category
      </Button>
      <BarBtn onClick={onMakeRule}>Make rule</BarBtn>
      <BarBtn onClick={onTrip}>Trip</BarBtn>
      <BarBtn onClick={onTag}>Tag</BarBtn>
      <BarBtn danger onClick={onDelete}>
        Delete
      </BarBtn>
      <BarBtn onClick={onClear} className={variant === 'inline' ? 'ml-auto' : 'ml-2'}>
        Clear
      </BarBtn>
    </>
  );

  if (variant === 'inline') {
    return (
      <div
        className="sticky top-0 z-40 mb-3 rounded-lg bg-navy-800 px-4 py-2.5 text-sm text-white shadow-md ring-1 ring-black/10"
        role="region"
        aria-label="Bulk actions for selected transactions"
      >
        <div className={wrap}>{inner}</div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-navy-700 bg-navy-900 px-4 py-2.5 text-sm text-white shadow-xl transition-all duration-200">
      <div className={wrap}>{inner}</div>
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  danger,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        danger
          ? 'text-neg-soft hover:bg-neg/30'
          : 'text-navy-100 hover:bg-navy-700'
      } ${className}`}
    >
      {children}
    </button>
  );
}
