/**
 * PageHeader — design system page title block.
 *
 * Used at the top of every route. Title is Heading-1 navy-900; optional
 * subtitle is Body-base gray-500. Right-aligned slot for actions / period
 * pickers / status badges.
 */

import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned action slot. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`mb-6 flex flex-wrap items-end justify-between gap-3 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 w-1 self-stretch rounded-full bg-gold-500" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-h1 font-bold tracking-tight text-navy-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-body-base text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
