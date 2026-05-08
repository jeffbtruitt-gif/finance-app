/**
 * Fama-French 3-Factor Model CSV parser.
 *
 * The CSV has a multi-line header comment, then a data section like:
 *   ,Mkt-RF,SMB,HML,RF
 *   192607,   2.89,  -2.55,  -2.39,   0.22
 *   ...
 * Monthly rows use YYYYMM format. Annual rows (YYYY) appear later and are skipped.
 * There's also a trailing copyright line.
 *
 * We extract only monthly rows and map them to { month: 'YYYY-MM-01', factor_key, rate }.
 */

import { type FfFactorKey } from '@/api/performance';

export interface FfParsedRow {
  month: string;       // 'YYYY-MM-01'
  factor_key: FfFactorKey;
  rate: number;        // percentage, e.g. 2.89
}

export interface FfParseResult {
  rows: FfParsedRow[];
  monthCount: number;
  warnings: string[];
}

const FACTOR_COLUMN_MAP: Record<string, FfFactorKey> = {
  'Mkt-RF': 'mkt_rf',
  'SMB': 'smb',
  'HML': 'hml',
  'RF': 'rf',
};

export function parseFamaFrenchCsv(csvText: string): FfParseResult {
  const lines = csvText.split(/\r?\n/);
  const warnings: string[] = [];
  const rows: FfParsedRow[] = [];
  const months = new Set<string>();

  // Find the header line (starts with comma, contains Mkt-RF).
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Mkt-RF')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { rows: [], monthCount: 0, warnings: ['Could not find Mkt-RF header in CSV'] };
  }

  const headers = lines[headerIdx].split(',').map((h) => h.trim());
  const factorIndices: { colIdx: number; key: FfFactorKey }[] = [];
  for (let ci = 0; ci < headers.length; ci++) {
    const mapped = FACTOR_COLUMN_MAP[headers[ci]];
    if (mapped) factorIndices.push({ colIdx: ci, key: mapped });
  }

  if (factorIndices.length !== 4) {
    warnings.push(`Expected 4 factor columns, found ${factorIndices.length}`);
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',').map((c) => c.trim());
    const dateStr = cols[0];

    // Monthly rows: exactly 6 digits (YYYYMM).
    if (!/^\d{6}$/.test(dateStr)) {
      // Annual rows (4 digits) or copyright — skip silently.
      continue;
    }

    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const iso = `${year}-${month}-01`;
    months.add(iso);

    for (const { colIdx, key } of factorIndices) {
      const raw = cols[colIdx];
      if (raw == null || raw === '') continue;
      const rate = Number(raw);
      if (!Number.isFinite(rate)) {
        warnings.push(`Row ${i + 1}: non-numeric value "${raw}" for ${key}, skipping`);
        continue;
      }
      rows.push({ month: iso, factor_key: key, rate });
    }
  }

  return { rows, monthCount: months.size, warnings };
}

/** Quick detect: does this text look like a Fama-French factor file? */
export function isFamaFrenchCsv(text: string): boolean {
  return text.includes('Mkt-RF') && text.includes('SMB') && text.includes('HML');
}
