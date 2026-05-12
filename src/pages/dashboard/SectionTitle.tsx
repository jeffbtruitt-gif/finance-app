/**
 * SectionTitle — dashboard section mini-header with gold kicker + accent title.
 */

import { type ReactNode } from 'react';

interface Props {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function SectionTitle({ kicker, title, subtitle, action }: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="text-label uppercase text-gold-600">{kicker}</div>
        <h2 className="ds-heading-accent mt-0.5 text-h2 font-bold text-navy-900">
          {title}
        </h2>
        {subtitle && (
          <div className="mt-1 text-caption text-gray-500">{subtitle}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
