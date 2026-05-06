/**
 * Format a YYYY-MM-DD date string as MM/DD/YYYY without going through the
 * Date object — that would apply local timezone math and could shift a date
 * by a day. Pure string surgery is safer for date-only fields.
 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = m ? String(Number(m)) : m;
  return `${month}/${d}/${y}`;
}

export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
