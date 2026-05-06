import type { ReactNode } from 'react';
import type { RuleCondition } from '@/types/phase2';

export const INP =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-navy-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20';

export const SCROLL_TIDY =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300';

export const OP_LABEL: Record<string, string> = {
  contains: 'contains',
  starts_with: 'starts with',
  equals: 'equals',
  regex: 'regex',
  between: 'between',
  eq: '=',
  gt: '>',
  lt: '<',
  is: 'is',
};

export function opLabel(c: RuleCondition): string {
  switch (c.field) {
    case 'description':
      return OP_LABEL[c.op] ?? c.op;
    case 'amount':
      return c.op === 'between' ? 'between' : OP_LABEL[c.op] ?? c.op;
    case 'account':
      return 'is';
    default:
      return '';
  }
}

export function conditionValueSnippet(c: RuleCondition): string {
  switch (c.field) {
    case 'description':
      return `"${c.value}"`;
    case 'amount':
      if (c.op === 'between') return `${c.min}–${c.max}`;
      return String(c.value);
    case 'account':
      return `"${c.value}"`;
  }
}

export function StatCard({
  label,
  value,
  secondary,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-label uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-h2 font-bold tabular-nums leading-none ${valueClassName ?? 'text-navy-900'}`}>
        {value}
      </div>
      {secondary != null && (
        <div className="mt-0.5 text-h4 font-medium text-gray-400">{secondary}</div>
      )}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: 'pos' | 'neg' | 'gold';
}) {
  const tone =
    accent === 'pos'
      ? 'text-pos'
      : accent === 'neg'
        ? 'text-neg'
        : accent === 'gold'
          ? 'text-gold-600'
          : 'text-navy-900';
  return (
    <div className="flex-1 border-r border-navy-100 px-5 py-4 last:border-r-0">
      <div className="text-label uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-[28px] font-bold tabular-nums leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-caption text-gray-500">{hint}</div>
    </div>
  );
}
