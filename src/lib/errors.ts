/**
 * Turn unknown thrown/rejected values into a user-visible message.
 * Supabase PostgrestError extends Error, but some layers may surface plain
 * objects or other shapes.
 */
export function errorMessageFromUnknown(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === 'string' && e.trim()) return e;
  if (typeof e === 'object' && e !== null) {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) {
      const base = o.message.trim();
      const code = typeof o.code === 'string' ? o.code.trim() : '';
      const details = typeof o.details === 'string' ? o.details.trim() : '';
      const hint = typeof o.hint === 'string' ? o.hint.trim() : '';
      const extra = [code && `(${code})`, details, hint].filter(Boolean).join(' ');
      return extra ? `${base} ${extra}` : base;
    }
  }
  try {
    return JSON.stringify(e);
  } catch {
    return 'Something went wrong.';
  }
}
