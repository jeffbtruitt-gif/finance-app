/**
 * Card — design system primitive.
 *
 * White surface on the navy-50 page background, with the standard sm shadow
 * and 10px (lg) radius from the design system. A `padded` prop toggles inner
 * padding (off when the card hosts a table that should run edge-to-edge).
 *
 * Three subcomponents:
 *   - <Card.Header>: top bar with optional title + subtitle + right-side
 *     action slot. Adds the standard divider beneath.
 *   - <Card.Section>: a padded body region; use multiple if you want
 *     dividers between sub-sections.
 *   - <Card.Footer>: muted gray-50 footer band.
 */

import { type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Pad the body (24px). Off when wrapping a table. Default true. */
  padded?: boolean;
}

export function Card({
  padded = true,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-lg border border-navy-100 bg-white shadow-sm ${padded ? 'p-6' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned slot for actions (buttons, links, status badges). */
  action?: ReactNode;
  className?: string;
}

Card.Header = function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: CardHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-navy-100 px-5 py-3.5 ${className}`}
    >
      <div className="min-w-0">
        <div className="text-h4 text-navy-800">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-caption text-gray-500">{subtitle}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

interface CardSectionProps {
  className?: string;
  children: ReactNode;
  /** When true, removes the default 20px padding (e.g. for nested tables). */
  flush?: boolean;
}

Card.Section = function CardSection({
  className = '',
  children,
  flush = false,
}: CardSectionProps) {
  return (
    <div className={`${flush ? '' : 'p-5'} ${className}`}>{children}</div>
  );
};

interface CardFooterProps {
  className?: string;
  children: ReactNode;
}

Card.Footer = function CardFooter({
  className = '',
  children,
}: CardFooterProps) {
  return (
    <div
      className={`border-t border-navy-100 bg-gray-50 px-5 py-2.5 text-caption text-gray-600 ${className}`}
    >
      {children}
    </div>
  );
};
