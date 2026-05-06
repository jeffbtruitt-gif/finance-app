import type { ParseResult, SourceType } from '../../../types/phase2';
import { discoverParser } from './discover';
import { amexParser } from './amex';
import { bcuVisaParser, bcuPowerplusParser, detectBcuVariant } from './bcu';
import Papa from 'papaparse';

/**
 * Parser registry. Order matters for detect() — Amex must be checked before
 * Discover because both have Date/Description/Amount, and Amex's Card Member
 * field is the disambiguator.
 *
 * BCU variants share one parser (variant resolved at parse time from row data).
 */
const PARSERS = [amexParser, discoverParser, bcuVisaParser, bcuPowerplusParser];

export interface DetectResult {
  source_type: SourceType | null;
  header_row: string[];
  raw_rows: Record<string, string>[];
}

/**
 * Reads a CSV file (as text), returns the detected source type plus the
 * parsed-but-not-yet-transformed rows. The caller then commits to a source
 * (using the auto-detected one or a user override) and calls parseRows.
 */
export function detectFromCsv(csvText: string): DetectResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data;

  const detected = PARSERS.find(p => p.detect(headers));
  let source_type: SourceType | null = detected?.source_type ?? null;
  // Visa vs Powerplus share the same header; disambiguate from Balance column.
  if (bcuVisaParser.detect(headers)) {
    source_type = detectBcuVariant(rows);
  }
  return {
    source_type,
    header_row: headers,
    raw_rows: rows,
  };
}

/**
 * Parse rows using a specific source type. Used after the user confirms (or
 * overrides) the auto-detected type.
 */
export function parseRows(
  source_type: SourceType,
  rows: Record<string, string>[],
): ParseResult {
  const parser = PARSERS.find(p => p.source_type === source_type);
  if (!parser) {
    return {
      source_type,
      transactions: [],
      warnings: [],
      errors: [`No parser registered for source type "${source_type}"`],
    };
  }
  const result = parser.parse(rows);
  // Override the source_type on the result if the user picked a BCU variant
  // — the parser returns the auto-detected variant, but if the user overrode
  // we honor that.
  return { ...result, source_type };
}

export { PARSERS };
