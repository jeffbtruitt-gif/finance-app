/**
 * Date parsing from per-source CSV formats into ISO YYYY-MM-DD.
 *
 * Each source uses a slightly different format; we centralize the conversion
 * so parsers don't reinvent it.
 */

/** MM/DD/YYYY → YYYY-MM-DD. Throws on bad input. */
export function parseSlashedDate4(input: string): string {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error(`Invalid MM/DD/YYYY date: "${input}"`);
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** MM/DD/YY → YYYY-MM-DD. Assumes 20YY for two-digit years. */
export function parseSlashedDate2(input: string): string {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) throw new Error(`Invalid MM/DD/YY date: "${input}"`);
  const [, mo, d, yy] = m;
  // Two-digit years: anything <= 79 is 20YY, otherwise 19YY (rolls in 2080)
  const year = parseInt(yy, 10) <= 79 ? 2000 + parseInt(yy, 10) : 1900 + parseInt(yy, 10);
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Parses a money string from a CSV — strips $, commas, whitespace, and
 * handles parens for negatives. Returns a Number (not a string).
 */
export function parseMoney(input: string): number {
  if (input == null) return NaN;
  let s = input.trim();
  if (!s) return NaN;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negative ? -n : n;
}

/** Round to 2 decimal places, avoiding float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
