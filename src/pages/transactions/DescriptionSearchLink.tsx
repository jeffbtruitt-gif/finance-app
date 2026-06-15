/**
 * DescriptionSearchLink — opens a Google search for a transaction description
 * in a new tab. Used to quickly identify an unfamiliar merchant so the user can
 * decide how to categorize the spend.
 *
 * Two layouts via `variant`:
 *  - "hover" (default): a compact icon meant to live at the right edge of a
 *    table cell. It only becomes visible when the surrounding row/cell is
 *    hovered, by reacting to a `group`/`group-hover` Tailwind ancestor. Wrap the
 *    cell content in a `group` container for the reveal to work.
 *  - "inline": always-visible icon for use beside a form field label
 *    (e.g. the edit/view drawer).
 */

import type { MouseEvent } from 'react';

export function googleSearchUrl(description: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(description.trim())}`;
}

export function DescriptionSearchLink({
  description,
  variant = 'hover',
  className = '',
}: {
  description: string | null | undefined;
  variant?: 'hover' | 'inline';
  className?: string;
}) {
  const text = (description ?? '').trim();
  if (!text) return null;

  // Don't let the click bubble to a row's onClick (which opens the drawer).
  const stop = (e: MouseEvent) => e.stopPropagation();

  const base =
    'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-navy-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300';
  const reveal =
    variant === 'hover'
      ? 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
      : '';

  return (
    <a
      href={googleSearchUrl(text)}
      target="_blank"
      rel="noopener noreferrer"
      data-no-row-select
      onClick={stop}
      title={`Search Google for "${text}"`}
      aria-label={`Search Google for ${text}`}
      className={`${base} ${reveal} ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.25" />
        <path d="m10.5 10.5 3 3" />
      </svg>
    </a>
  );
}
