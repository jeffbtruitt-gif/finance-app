/**
 * Button — design system primitive.
 *
 * Variants from the PDF (section 05): Primary / Secondary / Accent / Ghost
 * / Danger / Small. We expose them as a `variant` prop plus a `size`.
 *
 * - Primary  : navy-800 fill + white text. Default action on a page/form.
 * - Secondary: white fill + navy-200 border + navy-700 text. Cancel /
 *   secondary action.
 * - Accent   : gold-500 fill + navy-900 text. Reserved for "delight" CTAs;
 *   use sparingly.
 * - Ghost    : transparent + navy-700 text + hover navy-50 fill. Toolbar
 *   buttons and icon-only triggers.
 * - Danger   : neg fill + white text. Destructive confirmations.
 *
 * All variants share the same height per `size` so they line up in toolbars
 * and modal footers.
 */

import { type ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'ghost'
  | 'danger';

export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-1';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 focus-visible:ring-navy-500',
  secondary:
    'bg-white text-navy-700 border border-navy-200 hover:bg-navy-50 hover:border-navy-300 active:bg-navy-100 focus-visible:ring-navy-300',
  accent:
    'bg-gold-500 text-navy-900 hover:bg-gold-400 active:bg-gold-600 focus-visible:ring-gold-500',
  ghost:
    'bg-transparent text-navy-700 hover:bg-navy-50 active:bg-navy-100 focus-visible:ring-navy-300',
  danger:
    'bg-neg text-white hover:bg-[#a3331f] active:bg-[#8a2a19] focus-visible:ring-neg',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    />
  );
});
