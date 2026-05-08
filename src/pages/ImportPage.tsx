import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';
import { useHousehold, useUser, type Household } from '@/api/household';
import { detectFromCsv, parseRows } from '../features/import/parsers';
import { dedupeHash, dedupeHashMany } from '../lib/dedupe';
import { matchTrips } from '../features/trips/matcher';
import {
  findExistingTransactions,
  commitImport,
  applyBulkAction,
} from '../api/phase2';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { fetchCategories } from '@/api/transactions';
import {
  fetchImportMonthlyStats,
  fetchMonthHasNaturalImportedTransactions,
  type ImportMonthlyStatRow,
} from '@/api/importStats';
import { usePrivacyUsdFormatters } from '@/lib/usePrivacyUsdFormatters';
import { StatusPanel } from '@/components/StatusPanel';
import { useAppPeriod } from '@/lib/appPeriodContext';
import { formatPeriod, periodStartIso, type Period } from '@/lib/period';
import type {
  DuplicateMatch,
  ImportPreviewRow,
  ParsedTransaction,
  SourceType,
} from '../types/phase2';
import { Badge, Button, Card } from '@/components/ds';
import { AccountLinksPanel } from '@/components/AccountLinksPanel';
import {
  ensureFactorAccount,
  bulkUpsertRates,
  FF_FACTORS,
} from '@/api/performance';
import { parseFamaFrenchCsv } from '@/features/import/parsers/famaFrench';

/**
 * Import page (/import) — multi-file edition.
 *
 * Flow:
 *   1. User drops/picks N CSV files at once.
 *   2. For each file, the page parses the header, auto-detects the source
 *      type, and matches it to one of the household's accounts. If the user
 *      has exactly one account for that source type we pick it
 *      automatically; otherwise the row turns yellow and asks for a manual
 *      pick.
 *   3. The user can override the source type or the account per file.
 *   4. "Build preview" runs across every file with a resolved account:
 *        - parses rows
 *        - hashes them (dedupe key)
 *        - checks DB for existing transactions
 *        - dedupes WITHIN the batch too (same row appearing twice across
 *          files counts as 1 new + 1 duplicate)
 *        - matches trips
 *      Result: per-file stats (new / dup / trip-tagged) + a grand total.
 *   5. Click any Dup count to see the duplicates in a panel below the action
 *      bar. Each duplicate has an "Include anyway" checkbox — useful for
 *      legitimate same-day refunds or re-charges that look identical to an
 *      existing row. Selected overrides count toward the New total.
 *   6. "Commit all" creates ONE import_batches row per file (so the audit
 *      trail keeps each source file distinct) in a single click.
 *   7. Redirect to /transactions filtered to the most recent batch.
 *
 * The DB-side unique constraint on (household_id, dedupe_hash) was dropped in
 * migration 07 specifically to make step 5 work — dedupe is a UX heuristic,
 * not a data invariant.
 */

const SOURCE_LABELS: Record<SourceType, string> = {
  discover: 'Discover',
  amex: 'Amex',
  bcu_visa: 'BCU Cash Rewards Visa',
  bcu_powerplus: 'BCU Powerplus Checking',
  manual: 'Manual',
  fama_french: 'Fama-French 3-Factor',
};

const SOURCE_OPTIONS: SourceType[] = ['discover', 'amex', 'bcu_visa', 'bcu_powerplus'];

/** Stable id for the optional manual-entry batch (not a CSV file row). */
const MANUAL_IMPORT_FILE_ID = '__manual_import__';

interface ManualGridRow {
  id: string;
  date: string;
  description: string;
  amount: string;
}

interface ManualImportState {
  account_id: string | null;
  rows: ManualGridRow[];
  previewRows: ImportPreviewRow[] | null;
  status: 'pending' | 'ready' | 'error';
  errorMessage?: string;
}

function newManualRow(): ManualGridRow {
  return {
    id: crypto.randomUUID(),
    date: '',
    description: '',
    amount: '',
  };
}

function emptyManualImport(): ManualImportState {
  return {
    account_id: null,
    rows: Array.from({ length: 5 }, () => newManualRow()),
    previewRows: null,
    status: 'pending',
  };
}

/** Row is omitted from import when every field is blank. */
function isManualRowBlank(r: ManualGridRow): boolean {
  return !r.date.trim() && !r.description.trim() && !r.amount.trim();
}

/**
 * Parse pasted spreadsheet cells: optional $ and commas; parentheses = negative.
 */
function parsePastedAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[$,\s]/g, '').replace(/^\(+|\)+$/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

/** Accept ISO yyyy-mm-dd or common US M/D/YYYY (and variants). */
function parsePastedDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function manualRowsToParsedTxns(rows: ManualGridRow[]): {
  transactions: ParsedTransaction[];
  error?: string;
} {
  const transactions: ParsedTransaction[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (isManualRowBlank(r)) continue;
    const date = parsePastedDate(r.date);
    const amount = parsePastedAmount(r.amount);
    const description = r.description.trim();
    if (!date || amount === null || !description) {
      return {
        transactions: [],
        error: `Row ${i + 1}: need a valid date (YYYY-MM-DD or M/D/YYYY), description, and amount.`,
      };
    }
    transactions.push({
      date,
      description,
      amount,
      raw_row: {},
    });
  }
  return { transactions };
}

function splitPasteGrid(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // Drop one trailing empty line (Excel often ends with newline)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/** Apply clipboard TSV starting at row/col; expand row list as needed. Column order: date, description, amount. */
function mergePasteIntoManualRows(
  rows: ManualGridRow[],
  startRowIdx: number,
  startColIdx: number,
  grid: string[][],
): ManualGridRow[] {
  const next = rows.map((r) => ({ ...r }));
  const maxRow = startRowIdx + grid.length;
  while (next.length < maxRow) next.push(newManualRow());
  for (let r = 0; r < grid.length; r++) {
    const rowIdx = startRowIdx + r;
    const line = grid[r];
    for (let c = 0; c < line.length; c++) {
      const colIdx = startColIdx + c;
      if (colIdx > 2) continue;
      const cell = line[c] ?? '';
      const target = next[rowIdx];
      if (colIdx === 0) target.date = cell;
      else if (colIdx === 1) target.description = cell;
      else target.amount = cell;
    }
  }
  return next;
}

type ImportTripRow = { id: string; name: string; start_date: string; end_date: string };

type FirstSeenBatch = {
  file_name: string;
  date: string;
  description: string;
  amount: number;
};

async function buildImportPreviewRowsForAccount(args: {
  householdId: string;
  accountId: string;
  fileName: string;
  parsedTxns: ParsedTransaction[];
  trips: ImportTripRow[];
  firstSeenByHash: Map<string, FirstSeenBatch>;
}): Promise<ImportPreviewRow[]> {
  const { householdId, accountId, fileName, parsedTxns, trips, firstSeenByHash } = args;
  const hashes = await dedupeHashMany(
    accountId,
    parsedTxns.map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
    })),
  );

  const externalIds = parsedTxns.map((t) => t.external_id).filter((x): x is string => !!x);

  const {
    existing_external_ids,
    existing_hashes,
    matchesByHash,
    matchesByExternalId,
  } = await findExistingTransactions(householdId, accountId, externalIds, hashes);

  const tripMatches = matchTrips(parsedTxns, trips);

  return parsedTxns.map((tx, i) => {
    const hash = hashes[i];
    const isDupByExtId = !!tx.external_id && existing_external_ids.has(tx.external_id);
    const isDupByHash = existing_hashes.has(hash);
    const batchTwin = firstSeenByHash.get(hash);
    const isDupInBatch = !!batchTwin;
    const is_duplicate = isDupByExtId || isDupByHash || isDupInBatch;

    const duplicate_matches: DuplicateMatch[] = [];
    if (isDupByExtId && tx.external_id) {
      const m = matchesByExternalId.get(tx.external_id);
      if (m) {
        duplicate_matches.push({
          source: 'db',
          via: 'external_id',
          date: m.date,
          description: m.description,
          amount: m.amount,
          imported_at: m.imported_at,
          txn_id: m.id,
        });
      }
    }
    if (isDupByHash) {
      for (const m of matchesByHash.get(hash) ?? []) {
        duplicate_matches.push({
          source: 'db',
          via: 'hash',
          date: m.date,
          description: m.description,
          amount: m.amount,
          imported_at: m.imported_at,
          txn_id: m.id,
        });
      }
    }
    if (isDupInBatch && batchTwin) {
      duplicate_matches.push({
        source: 'batch',
        via: 'hash',
        date: batchTwin.date,
        description: batchTwin.description,
        amount: batchTwin.amount,
        file_name: batchTwin.file_name,
      });
    }

    if (!is_duplicate && !firstSeenByHash.has(hash)) {
      firstSeenByHash.set(hash, {
        file_name: fileName,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
      });
    }

    return {
      parsed: tx,
      dedupe_hash: hash,
      is_duplicate,
      duplicate_match_type: isDupByExtId
        ? 'external_id'
        : isDupByHash || isDupInBatch
        ? 'hash'
        : undefined,
      duplicate_matches: duplicate_matches.length > 0 ? duplicate_matches : undefined,
      trip_match: tripMatches.get(i),
    };
  });
}

/** Same duplicate fingerprint logic as CSV preview, without trip matching. */
async function buildRecurringPreviewRows(args: {
  householdId: string;
  accountId: string;
  parsedTxns: ParsedTransaction[];
}): Promise<ImportPreviewRow[]> {
  const { householdId, accountId, parsedTxns } = args;
  if (parsedTxns.length === 0) return [];

  const hashes = await dedupeHashMany(
    accountId,
    parsedTxns.map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
    })),
  );

  const { existing_hashes, matchesByHash } = await findExistingTransactions(
    householdId,
    accountId,
    [],
    hashes,
  );

  const firstSeenByHash = new Map<
    string,
    { date: string; description: string; amount: number }
  >();

  return parsedTxns.map((tx, i) => {
    const hash = hashes[i];
    const isDupByHash = existing_hashes.has(hash);
    const batchTwin = firstSeenByHash.get(hash);
    const isDupInBatch = !!batchTwin;
    const is_duplicate = isDupByHash || isDupInBatch;

    const duplicate_matches: DuplicateMatch[] = [];
    if (isDupByHash) {
      for (const m of matchesByHash.get(hash) ?? []) {
        duplicate_matches.push({
          source: 'db',
          via: 'hash',
          date: m.date,
          description: m.description,
          amount: m.amount,
          imported_at: m.imported_at,
          txn_id: m.id,
        });
      }
    }
    if (isDupInBatch && batchTwin) {
      duplicate_matches.push({
        source: 'batch',
        via: 'hash',
        date: batchTwin.date,
        description: batchTwin.description,
        amount: batchTwin.amount,
        file_name: 'Recurring batch',
      });
    }

    if (!is_duplicate && !firstSeenByHash.has(hash)) {
      firstSeenByHash.set(hash, {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
      });
    }

    return {
      parsed: tx,
      dedupe_hash: hash,
      is_duplicate,
      duplicate_match_type: isDupByHash || isDupInBatch ? 'hash' : undefined,
      duplicate_matches: duplicate_matches.length > 0 ? duplicate_matches : undefined,
    };
  });
}

// ------------------------------------------------------------------------------
// Recurring templates (local storage per household)
// ------------------------------------------------------------------------------

interface RecurringTemplate {
  id: string;
  description: string;
  amount: number;
  category_id: string;
  account_id: string;
}

function recurringStorageKey(householdId: string): string {
  return `tf:recurring-templates:v1:${householdId}`;
}

function manualImportAsFileRow(manual: ManualImportState, parsedTxns: ParsedTransaction[]): FileRow {
  return {
    id: MANUAL_IMPORT_FILE_ID,
    file: new File([], 'Manual entry'),
    fileName: 'Manual entry',
    csvText: '',
    detectedSource: null,
    source: null,
    account_id: manual.account_id,
    parsedTxns,
    parseWarnings: [],
    parseErrors: [],
    previewRows: manual.previewRows,
    status: manual.status === 'ready' ? 'ready' : manual.status === 'error' ? 'error' : 'pending',
    errorMessage: manual.errorMessage,
  };
}

// ============================================================================
// Per-file state
// ============================================================================

/**
 * One row in the file table. Mutates as the user adjusts the source/account
 * pickers or the preview is built. Each file owns its own preview rows so
 * commit can write a separate batch per file.
 */
interface FileRow {
  /** Stable per-file id; used as React key + for mutating individual rows. */
  id: string;
  file: File;
  fileName: string;
  csvText: string;
  /** Auto-detected at file load; user can override. */
  detectedSource: SourceType | null;
  source: SourceType | null;
  /** Resolved account id; auto if exactly one account matches the source. */
  account_id: string | null;
  /** Parsed rows once `parse` runs. */
  parsedTxns: ParsedTransaction[];
  parseWarnings: string[];
  parseErrors: string[];
  /**
   * Preview output — populated by Build preview. Each row's `is_duplicate`
   * reflects what the dedupe check found at preview time. Whether the row
   * actually gets inserted at commit also depends on
   * `includedDuplicateHashes` (page-level state).
   */
  previewRows: ImportPreviewRow[] | null;
  /** For UI: 'pending' before preview; 'ready' once preview built; 'error' on
   *  parse/preview failure. */
  status: 'pending' | 'ready' | 'error';
  errorMessage?: string;
  /** Fama-French specific: parsed factor data ready for import. */
  ffParsed?: {
    monthCount: number;
    rowCount: number;
    minMonth: string;
    maxMonth: string;
    warnings: string[];
  };
}

/** The runtime shape used by the table rows + commit logic — derived from a
 *  FileRow plus the page-level override Set. Computed via fileStats(). */
interface FileStats {
  newCount: number;
  dupCount: number;
  tripTaggedCount: number;
  /** `previewRows` filtered to those that should be inserted (non-dup OR
   *  user-overridden dup). Used at commit time. */
  effectiveNewRows: ImportPreviewRow[];
  /** `previewRows` filtered to those still being skipped (dup AND not
   *  overridden). Used by the duplicates panel UI. */
  effectiveDupRows: ImportPreviewRow[];
}

/**
 * Apply the user's "include anyway" overrides to a file's preview to get the
 * counts and row sets the UI + commit care about.
 */
function statsFromPreviewRows(
  rows: ImportPreviewRow[],
  includedDuplicateHashes: Set<string>,
): FileStats {
  const effectiveNewRows: ImportPreviewRow[] = [];
  const effectiveDupRows: ImportPreviewRow[] = [];
  for (const r of rows) {
    if (!r.is_duplicate || includedDuplicateHashes.has(r.dedupe_hash)) {
      effectiveNewRows.push(r);
    } else {
      effectiveDupRows.push(r);
    }
  }
  return {
    newCount: effectiveNewRows.length,
    dupCount: effectiveDupRows.length,
    tripTaggedCount: effectiveNewRows.filter((r) => r.trip_match).length,
    effectiveNewRows,
    effectiveDupRows,
  };
}

function fileStats(
  file: FileRow,
  includedDuplicateHashes: Set<string>,
): FileStats {
  return statsFromPreviewRows(file.previewRows ?? [], includedDuplicateHashes);
}

// ============================================================================
// Page
// ============================================================================

type ImportPageTab = 'import' | 'manual' | 'recurring' | 'imported';

export function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const household = useHousehold();
  const user = useUser();
  const { period } = useAppPeriod();

  const [pageTab, setPageTab] = useState<ImportPageTab>('import');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [building, setBuilding] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /**
   * Set of `dedupe_hash`es the user has explicitly chosen to import even
   * though the preview flagged them as duplicates. Cleared whenever a new
   * preview is built (the override is meaningful only for the duplicates the
   * user has just SEEN; a fresh preview surfaces a new set).
   */
  const [includedDuplicateHashes, setIncludedDuplicateHashes] = useState<
    Set<string>
  >(new Set());

  const [manualImport, setManualImport] = useState<ManualImportState>(() => emptyManualImport());

  /**
   * Which file's duplicates panel is open. `'all'` shows the cross-file
   * duplicate list (clicked from the totals row); a file id shows just that
   * file's duplicates; `null` is the closed state.
   */
  const [dupsPanelFor, setDupsPanelFor] = useState<string | 'all' | null>(null);

  function toggleDupOverride(hash: string) {
    setIncludedDuplicateHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }

  // Load accounts for source-to-account matching.
  const accountsQuery = useQuery({
    queryKey: ['accounts', household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_accounts')
        .select('id, name, source_type')
        .eq('household_id', household!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const importStatsQuery = useQuery({
    queryKey: ['import-monthly-stats', household?.id],
    enabled: !!household?.id && pageTab === 'imported',
    queryFn: () => fetchImportMonthlyStats(household!.id),
  });

  const tripsQuery = useQuery({
    queryKey: ['trips', household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_trips')
        .select('id, name, start_date, end_date')
        .eq('household_id', household!.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  /**
   * Build a quick lookup from source_type → account_id WHEN exactly one
   * account exists for that source. Multiple accounts of the same type force
   * a manual pick (we can't guess between two BCU Visa cards).
   */
  const sourceToAutoAccount = useMemo(() => {
    const m = new Map<SourceType, string>();
    const counts = new Map<SourceType, number>();
    for (const a of accountsQuery.data ?? []) {
      const s = a.source_type as SourceType;
      counts.set(s, (counts.get(s) ?? 0) + 1);
      m.set(s, a.id);
    }
    // Strip ambiguous ones.
    for (const [s, n] of counts) if (n > 1) m.delete(s);
    return m;
  }, [accountsQuery.data]);

  // -------- File ingestion --------

  async function addFiles(newFiles: File[]) {
    if (newFiles.length === 0) return;
    const csvs = newFiles.filter((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
    const created: FileRow[] = await Promise.all(
      csvs.map(async (file) => {
        const text = await file.text();
        const detected = detectFromCsv(text);
        const source = detected.source_type;

        // Fama-French files go through a separate parse path.
        if (source === 'fama_french') {
          const ffResult = parseFamaFrenchCsv(text);
          const months = [...new Set(ffResult.rows.map((r) => r.month))].sort();
          return {
            id: crypto.randomUUID(),
            file,
            fileName: file.name,
            csvText: text,
            detectedSource: source,
            source,
            account_id: null,
            parsedTxns: [],
            parseWarnings: ffResult.warnings,
            parseErrors: [],
            previewRows: null,
            status: ffResult.rows.length > 0 ? 'pending' as const : 'error' as const,
            errorMessage: ffResult.rows.length === 0 ? 'No monthly data found in file.' : undefined,
            ffParsed: ffResult.rows.length > 0
              ? {
                  monthCount: ffResult.monthCount,
                  rowCount: ffResult.rows.length,
                  minMonth: months[0],
                  maxMonth: months[months.length - 1],
                  warnings: ffResult.warnings,
                }
              : undefined,
          };
        }

        const account_id = source ? sourceToAutoAccount.get(source) ?? null : null;

        // Parse immediately so we have row counts to display in the table.
        let parsedTxns: ParsedTransaction[] = [];
        let parseWarnings: string[] = [];
        let parseErrors: string[] = [];
        if (source) {
          const result = parseRows(source, detected.raw_rows);
          parsedTxns = result.transactions;
          parseWarnings = result.warnings;
          parseErrors = result.errors;
        }

        // A "0 transactions parsed" file is always an error in the UI — there
        // is nothing useful we can do with it. Distinguish three causes:
        //   1. Parser threw fatal errors (parseErrors populated)
        //   2. Parser skipped every row as warnings (column-name mismatch
        //      with the bank's current export format is the usual culprit)
        //   3. The file just has zero data rows (downloaded an empty range)
        const status: FileRow['status'] =
          source && parsedTxns.length === 0 ? 'error' : 'pending';
        let errorMessage: string | undefined;
        if (status === 'error') {
          if (parseErrors.length > 0) {
            errorMessage = parseErrors[0];
          } else if (parseWarnings.length > 0) {
            const sample = parseWarnings.slice(0, 2).join('; ');
            errorMessage = `0 transactions parsed (${detected.raw_rows.length} CSV rows seen). ${sample}`;
          } else if (detected.raw_rows.length === 0) {
            errorMessage = 'No data rows in CSV.';
          } else {
            errorMessage =
              'No transactions parsed. The file may use a different export format than expected.';
          }
        }

        return {
          id: crypto.randomUUID(),
          file,
          fileName: file.name,
          csvText: text,
          detectedSource: source,
          source,
          account_id,
          parsedTxns,
          parseWarnings,
          parseErrors,
          previewRows: null,
          status,
          errorMessage,
        };
      }),
    );
    setFiles((prev) => [...prev, ...created]);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    setFiles([]);
  }

  async function importFamaFrenchFile(file: FileRow) {
    if (!household || file.source !== 'fama_french') return;
    updateFile(file.id, { status: 'pending' } as Partial<FileRow>);
    try {
      const result = parseFamaFrenchCsv(file.csvText);
      const acctIdByKey = new Map<string, string>();
      for (const factor of FF_FACTORS) {
        const acctId = await ensureFactorAccount(household.id, factor.key, `${factor.short} — ${factor.label}`);
        acctIdByKey.set(factor.key, acctId);
      }
      const rateRows = result.rows.map((r) => ({
        account_id: acctIdByKey.get(r.factor_key)!,
        month: r.month,
        rate: r.rate,
      }));
      await bulkUpsertRates(rateRows);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, status: 'ready' as const } : f,
        ),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, status: 'error' as const, errorMessage: err instanceof Error ? err.message : String(err) }
            : f,
        ),
      );
    }
  }

  /** Mutate one file's source/account choice. Resets that file's preview
   *  state (account/source change invalidates the dedupe lookup). */
  function updateFile(id: string, patch: Partial<FileRow>) {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch, previewRows: null, status: 'pending' as const };
        // If source changed, reparse.
        if (patch.source !== undefined && patch.source !== f.source) {
          if (patch.source === null) {
            return {
              ...next,
              parsedTxns: [],
              parseWarnings: [],
              parseErrors: [],
              status: 'pending',
            };
          }
          const detected = detectFromCsv(f.csvText);
          const result = parseRows(patch.source, detected.raw_rows);
          // Same "0 transactions = error" rule as initial load.
          const status: FileRow['status'] =
            result.transactions.length === 0 ? 'error' : 'pending';
          let errorMessage: string | undefined;
          if (status === 'error') {
            if (result.errors.length > 0) {
              errorMessage = result.errors[0];
            } else if (result.warnings.length > 0) {
              errorMessage = `0 transactions parsed (${detected.raw_rows.length} CSV rows seen). ${result.warnings.slice(0, 2).join('; ')}`;
            } else {
              errorMessage =
                'No transactions parsed. Wrong format selected?';
            }
          }
          return {
            ...next,
            parsedTxns: result.transactions,
            parseWarnings: result.warnings,
            parseErrors: result.errors,
            status,
            errorMessage,
            // Re-resolve the auto-account if the user hasn't manually chosen.
            account_id:
              patch.account_id !== undefined
                ? patch.account_id
                : sourceToAutoAccount.get(patch.source) ?? null,
          };
        }
        return next;
      }),
    );
  }

  // -------- Build preview (across all files) --------

  /**
   * CSV import tab: walk loaded files, hash + duplicate lookup + trips (see
   * `buildImportPreviewRowsForAccount`). Does not change manual-entry state.
   */
  async function buildCsvPreviews() {
    if (!household) return;
    setBuilding(true);
    setIncludedDuplicateHashes(new Set());
    setDupsPanelFor(null);
    try {
      const trips = tripsQuery.data ?? [];
      const firstSeenByHash = new Map<string, FirstSeenBatch>();

      const updated: FileRow[] = [];
      for (const f of files) {
        if (!f.account_id || !f.source || f.parsedTxns.length === 0) {
          updated.push(f);
          continue;
        }
        try {
          const previewRows = await buildImportPreviewRowsForAccount({
            householdId: household.id,
            accountId: f.account_id,
            fileName: f.fileName,
            parsedTxns: f.parsedTxns,
            trips,
            firstSeenByHash,
          });

          updated.push({
            ...f,
            previewRows,
            status: 'ready',
            errorMessage: undefined,
          });
        } catch (err) {
          updated.push({
            ...f,
            status: 'error',
            errorMessage: (err as Error).message ?? 'Preview failed',
          });
        }
      }
      setFiles(updated);
    } finally {
      setBuilding(false);
    }
  }

  /** Manual Add tab: preview grid rows only. Does not change CSV file state. */
  async function buildManualPreview() {
    if (!household) return;
    setBuilding(true);
    setIncludedDuplicateHashes(new Set());
    setDupsPanelFor(null);
    try {
      const trips = tripsQuery.data ?? [];
      const firstSeenByHash = new Map<string, FirstSeenBatch>();
      const mdParsed = manualRowsToParsedTxns(manualImport.rows);
      if (!manualImport.account_id || mdParsed.transactions.length === 0) {
        setManualImport((prev) => ({
          ...prev,
          previewRows: null,
          status: 'pending',
          errorMessage: undefined,
        }));
      } else if (mdParsed.error) {
        setManualImport((prev) => ({
          ...prev,
          previewRows: null,
          status: 'error',
          errorMessage: mdParsed.error,
        }));
      } else {
        try {
          const previewRows = await buildImportPreviewRowsForAccount({
            householdId: household.id,
            accountId: manualImport.account_id,
            fileName: 'Manual entry',
            parsedTxns: mdParsed.transactions,
            trips,
            firstSeenByHash,
          });
          setManualImport((prev) => ({
            ...prev,
            previewRows,
            status: 'ready',
            errorMessage: undefined,
          }));
        } catch (err) {
          setManualImport((prev) => ({
            ...prev,
            previewRows: null,
            status: 'error',
            errorMessage: (err as Error).message ?? 'Preview failed',
          }));
        }
      }
    } finally {
      setBuilding(false);
    }
  }

  // -------- Commit --------

  /**
   * Commits each ready file as its own import_batches row, in series. We
   * could fire them in parallel but serial keeps the audit log readable
   * (timestamps in the order the user selected) and avoids hammering
   * Supabase. Total volume is small.
   */
  const commitMut = useMutation({
    mutationFn: async () => {
      if (!household || !user) throw new Error('Missing context');
      const ready: FileRow[] = files.filter((f) => f.status === 'ready' && f.previewRows);
      if (
        manualImport.status === 'ready' &&
        manualImport.previewRows &&
        manualImport.account_id
      ) {
        const parsed = manualRowsToParsedTxns(manualImport.rows).transactions;
        if (parsed.length > 0) {
          ready.push(manualImportAsFileRow(manualImport, parsed));
        }
      }
      if (ready.length === 0) throw new Error('Nothing to commit');

      const batchIds: string[] = [];
      for (const f of ready) {
        // effectiveNewRows respects the user's "include anyway" overrides.
        const { effectiveNewRows } = fileStats(f, includedDuplicateHashes);
        if (effectiveNewRows.length === 0) continue;
        const { batch_id } = await commitImport({
          household_id: household.id,
          account_id: f.account_id!,
          source_file: f.fileName,
          total_rows: f.parsedTxns.length,
          new_rows: effectiveNewRows,
          imported_by: user.id,
        });
        batchIds.push(batch_id);
      }
      return { batchIds };
    },
    onMutate: () => setCommitting(true),
    onSettled: () => setCommitting(false),
    onSuccess: ({ batchIds }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({
        queryKey: ['latest-actual-period-global'],
      });
      if (household?.id) {
        queryClient.invalidateQueries({
          queryKey: ['import-monthly-stats', household.id],
        });
        queryClient.invalidateQueries({
          queryKey: ['recurring-month-natural-import', household.id],
        });
      }
      // Navigate to the LAST batch — covers the most recent user action.
      // If multiple files were committed they're all visible in the
      // transactions grid via the standard filters.
      const latest = batchIds[batchIds.length - 1];
      if (latest) {
        navigate(`/transactions?batch=${latest}&filter=uncategorized`);
      } else {
        // Everything was a duplicate — go to /transactions but no batch
        // filter, since nothing was inserted.
        navigate('/transactions');
      }
    },
  });

  // -------- Derived UI state --------

  const accounts = accountsQuery.data ?? [];
  const filesNeedingAccount = files.filter((f) => f.status !== 'error' && !f.account_id && f.source !== 'fama_french');
  const filesNeedingSource = files.filter((f) => f.status !== 'error' && !f.source);
  const filesReady = files.filter((f) => f.status === 'ready');
  const filesPending = files.filter(
    (f) => f.status === 'pending' && f.source && f.account_id,
  );

  const manualParsedDraft = manualRowsToParsedTxns(manualImport.rows);
  const manualCanBuild =
    !!manualImport.account_id &&
    manualParsedDraft.transactions.length > 0 &&
    !manualParsedDraft.error;
  const manualNeedsPreviewBuild = manualImport.status === 'pending' && manualCanBuild;

  const canBuildPreviewCsv = !building && filesPending.length > 0;
  const canBuildPreviewManual = !building && manualNeedsPreviewBuild;

  const manualReadyForCommit =
    manualImport.status === 'ready' &&
    !!manualImport.previewRows &&
    !!manualImport.account_id &&
    manualParsedDraft.transactions.length > 0 &&
    !manualParsedDraft.error;

  const anyCsvReady = files.some((f) => f.status === 'ready' && f.previewRows);
  const anyReadyForCommit = anyCsvReady || manualReadyForCommit;

  const manualTouched =
    !!manualImport.account_id ||
    manualImport.rows.some((r) => !isManualRowBlank(r)) ||
    manualImport.status !== 'pending';

  const csvTotals = useMemo(() => {
    let newCount = 0;
    let dupCount = 0;
    let tripTaggedCount = 0;
    let rowSum = 0;
    for (const f of filesReady) {
      if (!f.previewRows) continue;
      rowSum += f.parsedTxns.length;
      const s = fileStats(f, includedDuplicateHashes);
      newCount += s.newCount;
      dupCount += s.dupCount;
      tripTaggedCount += s.tripTaggedCount;
    }
    return { newCount, dupCount, tripTaggedCount, rowSum };
  }, [filesReady, includedDuplicateHashes]);

  // Derived stats per ready file, applying override Set. Memoize so the
  // various consumers (table, totals, panel) don't recompute redundantly.
  const statsByFile = useMemo(() => {
    const m = new Map<string, FileStats>();
    for (const f of filesReady) {
      if (f.previewRows) m.set(f.id, fileStats(f, includedDuplicateHashes));
    }
    if (
      manualImport.status === 'ready' &&
      manualImport.previewRows &&
      manualImport.account_id
    ) {
      m.set(
        MANUAL_IMPORT_FILE_ID,
        statsFromPreviewRows(manualImport.previewRows, includedDuplicateHashes),
      );
    }
    return m;
  }, [
    filesReady,
    manualImport.status,
    manualImport.previewRows,
    manualImport.account_id,
    includedDuplicateHashes,
  ]);

  let grandNew = 0;
  let grandDup = 0;
  let grandTrip = 0;
  for (const s of statsByFile.values()) {
    grandNew += s.newCount;
    grandDup += s.dupCount;
    grandTrip += s.tripTaggedCount;
  }
  const overrideCount = includedDuplicateHashes.size;

  const canCommit = anyReadyForCommit && !committing && grandNew > 0;

  const dupPanelFiles = useMemo(() => {
    const list = filesReady.filter((f) => f.previewRows);
    const parsedManual = manualRowsToParsedTxns(manualImport.rows).transactions;
    if (
      manualImport.status === 'ready' &&
      manualImport.previewRows &&
      manualImport.account_id &&
      parsedManual.length > 0
    ) {
      list.push(manualImportAsFileRow(manualImport, parsedManual));
    }
    return list;
  }, [filesReady, manualImport]);

  const confirmCommitFiles = dupPanelFiles;

  return (
    <div className="flex gap-0">
      <AccountLinksPanel />
      <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-navy-100">
        <ImportTabButton active={pageTab === 'import'} onClick={() => setPageTab('import')}>
          Import
        </ImportTabButton>
        <ImportTabButton active={pageTab === 'imported'} onClick={() => setPageTab('imported')}>
          Imported Data
        </ImportTabButton>
        <ImportTabButton active={pageTab === 'recurring'} onClick={() => setPageTab('recurring')}>
          Recurring
        </ImportTabButton>
        <ImportTabButton active={pageTab === 'manual'} onClick={() => setPageTab('manual')}>
          Manual Add
        </ImportTabButton>
      </div>

      {pageTab === 'import' && (
        <div>
      <p className="mb-4 max-w-3xl text-body-base text-gray-500">
        Drop one or more CSV files. The app auto-detects each file&apos;s source format and matches
        it to the right account. Adjust if needed, then build the preview and commit. To type or
        paste rows instead, use the <strong>Manual Add</strong> tab.
      </p>

      <FileDrop onFiles={addFiles} />

      {files.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/60 px-4 py-2">
            <div className="text-sm font-semibold text-navy-800">
              {files.length} {files.length === 1 ? 'file' : 'files'} loaded
            </div>
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-navy-700"
            >
              Remove all
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-navy-50/60 text-[11px] uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">File</th>
                <th className="px-3 py-2 text-left font-semibold">Format (auto)</th>
                <th className="px-3 py-2 text-left font-semibold">Account</th>
                <th className="px-3 py-2 text-right font-semibold">Rows</th>
                <th className="px-3 py-2 text-right font-semibold">New</th>
                <th className="px-3 py-2 text-right font-semibold">Dup</th>
                <th className="px-3 py-2 text-right font-semibold">Trip</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <FileTableRow
                  key={f.id}
                  file={f}
                  stats={statsByFile.get(f.id) ?? null}
                  accounts={accounts}
                  onChange={(patch) => updateFile(f.id, patch)}
                  onRemove={() => removeFile(f.id)}
                  onShowDups={() => setDupsPanelFor(f.id)}
                  onImportFamaFrench={
                    f.source === 'fama_french' && f.ffParsed && household
                      ? () => importFamaFrenchFile(f)
                      : undefined
                  }
                />
              ))}
              {filesReady.length > 0 && (
                <tr className="border-t-2 border-navy-700 bg-navy-800 font-bold text-white">
                  <td className="px-3 py-2 text-left" colSpan={3}>
                    Total ({filesReady.length} ready)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {csvTotals.rowSum}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {csvTotals.newCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {csvTotals.dupCount > 0 ? (
                      <button
                        onClick={() => setDupsPanelFor('all')}
                        className="underline-offset-2 hover:underline"
                        title="Click to review duplicates across all files"
                      >
                        {csvTotals.dupCount}
                      </button>
                    ) : (
                      csvTotals.dupCount
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {csvTotals.tripTaggedCount}
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {filesNeedingSource.length > 0 && (
        <div className="mt-3">
          <Badge tone="warn" dot>
            {filesNeedingSource.length}{' '}
            {filesNeedingSource.length === 1 ? 'file needs' : 'files need'} a
            source format selected.
          </Badge>
        </div>
      )}
      {filesNeedingAccount.length > 0 && (
        <div className="mt-3">
          <Badge tone="warn" dot>
            {filesNeedingAccount.length}{' '}
            {filesNeedingAccount.length === 1 ? 'file needs' : 'files need'} an
            account picked. (You probably have multiple accounts of the same
            type — auto-pick can't disambiguate.)
          </Badge>
        </div>
      )}
      {(files.length > 0 || anyCsvReady) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={buildCsvPreviews}
            disabled={!canBuildPreviewCsv}
          >
            {building ? 'Analyzing…' : 'Build preview'}
          </Button>
          {anyReadyForCommit && (
            <Button
              variant="accent"
              onClick={() => setConfirmOpen(true)}
              disabled={!canCommit || grandNew === 0}
            >
              Commit all ({grandNew} new)
            </Button>
          )}
          {overrideCount > 0 && (
            <Badge tone="warn">
              {overrideCount} override{overrideCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      )}
        </div>
      )}

      {pageTab === 'manual' && (
        <div>
          <p className="mb-4 max-w-3xl text-body-base text-gray-500">
            Enter transactions in the grid or paste from a spreadsheet (tab-separated columns: date,
            description, amount). Pick an account, build the preview, then commit — same dedupe and
            trip matching as CSV imports.
          </p>

          <ManualImportSection
            accounts={accounts}
            manualImport={manualImport}
            onAccountChange={(account_id) =>
              setManualImport((p) => ({
                ...p,
                account_id,
                previewRows: null,
                status: 'pending',
                errorMessage: undefined,
              }))
            }
            onRowChange={(id, patch) =>
              setManualImport((p) => ({
                ...p,
                rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
                previewRows: null,
                status: 'pending',
                errorMessage: undefined,
              }))
            }
            onPasteFromClipboard={(rowIdx, colIdx, text) =>
              setManualImport((p) => ({
                ...p,
                rows: mergePasteIntoManualRows(p.rows, rowIdx, colIdx, splitPasteGrid(text)),
                previewRows: null,
                status: 'pending',
                errorMessage: undefined,
              }))
            }
            onAddRows={() =>
              setManualImport((p) => ({
                ...p,
                rows: [...p.rows, newManualRow()],
                previewRows: null,
                status: 'pending',
                errorMessage: undefined,
              }))
            }
            onRemoveRow={(id) =>
              setManualImport((p) => {
                let rows =
                  p.rows.length <= 1
                    ? p.rows.map((r) =>
                        r.id === id ? { ...r, date: '', description: '', amount: '' } : r,
                      )
                    : p.rows.filter((r) => r.id !== id);
                if (rows.length === 0) rows = [newManualRow()];
                return {
                  ...p,
                  rows,
                  previewRows: null,
                  status: 'pending',
                  errorMessage: undefined,
                };
              })
            }
            onClear={() => setManualImport(emptyManualImport())}
            stats={statsByFile.get(MANUAL_IMPORT_FILE_ID) ?? null}
            onShowDups={() => setDupsPanelFor(MANUAL_IMPORT_FILE_ID)}
          />

          {manualImport.rows.some((r) => !isManualRowBlank(r)) && !manualImport.account_id && (
            <div className="mt-3">
              <Badge tone="warn" dot>
                Manual table has rows — pick an account before building the preview.
              </Badge>
            </div>
          )}

          {(manualTouched || manualReadyForCommit) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={buildManualPreview}
                disabled={!canBuildPreviewManual}
              >
                {building ? 'Analyzing…' : 'Build preview'}
              </Button>
              {anyReadyForCommit && (
                <Button
                  variant="accent"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canCommit || grandNew === 0}
                >
                  Commit all ({grandNew} new)
                </Button>
              )}
              {overrideCount > 0 && (
                <Badge tone="warn">
                  {overrideCount} override{overrideCount === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {(pageTab === 'import' || pageTab === 'manual') && dupsPanelFor !== null && (
        <DuplicatesPanel
          files={dupPanelFiles}
          statsByFile={statsByFile}
          scope={dupsPanelFor}
          includedDuplicateHashes={includedDuplicateHashes}
          onToggle={toggleDupOverride}
          onClose={() => setDupsPanelFor(null)}
          onScopeChange={setDupsPanelFor}
        />
      )}

      {(pageTab === 'import' || pageTab === 'manual') && confirmOpen && (
        <ConfirmModal
          files={confirmCommitFiles}
          statsByFile={statsByFile}
          grandNew={grandNew}
          grandDup={grandDup}
          grandTrip={grandTrip}
          overrideCount={overrideCount}
          onConfirm={() => {
            setConfirmOpen(false);
            commitMut.mutate();
          }}
          onCancel={() => setConfirmOpen(false)}
          committing={committing}
        />
      )}

      {pageTab === 'imported' && (
        <ImportedDataTab
          period={period}
          loading={importStatsQuery.isLoading}
          error={importStatsQuery.error as Error | null}
          rows={importStatsQuery.data ?? []}
        />
      )}

      {pageTab === 'recurring' && (
        <RecurringTemplatesTab
          household={household}
          user={user}
          period={period}
          accounts={accounts}
          queryClient={queryClient}
        />
      )}

    </div>
    </div>
    </div>
  );
}

function RecurringTemplatesTab({
  household,
  user,
  period,
  accounts,
  queryClient,
}: {
  household: Household | null;
  user: User | null;
  period: Period;
  accounts: Array<{ id: string; name: string; source_type: string }>;
  queryClient: QueryClient;
}) {
  const schemeQ = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQ = useQuery({
    queryKey: ['categories', schemeQ.data],
    enabled: !!schemeQ.data,
    queryFn: () => fetchCategories(schemeQ.data!),
  });

  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [templatesHydrated, setTemplatesHydrated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftDesc, setDraftDesc] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftAccountId, setDraftAccountId] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null);
  const [applying, setApplying] = useState(false);

  const householdId = household?.id;

  useEffect(() => {
    if (!householdId) {
      setTemplates([]);
      setTemplatesHydrated(false);
      return;
    }
    try {
      const raw = localStorage.getItem(recurringStorageKey(householdId));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setTemplates(
            parsed.filter((t): t is RecurringTemplate => {
              if (!t || typeof t !== 'object') return false;
              const o = t as Record<string, unknown>;
              return (
                typeof o.id === 'string' &&
                typeof o.description === 'string' &&
                typeof o.amount === 'number' &&
                typeof o.category_id === 'string' &&
                typeof o.account_id === 'string'
              );
            }),
          );
        } else {
          setTemplates([]);
        }
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    }
    setTemplatesHydrated(true);
  }, [householdId]);

  useEffect(() => {
    if (!householdId || !templatesHydrated) return;
    try {
      localStorage.setItem(recurringStorageKey(householdId), JSON.stringify(templates));
    } catch {
      /* ignore quota */
    }
  }, [householdId, templates, templatesHydrated]);

  const categories = categoriesQ.data ?? [];
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const templatesSignature = useMemo(
    () =>
      JSON.stringify(
        [...templates]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((t) => ({
            id: t.id,
            account_id: t.account_id,
            amount: t.amount,
            description: t.description,
          })),
      ),
    [templates],
  );

  const monthPostedQuery = useQuery({
    queryKey: [
      'recurring-template-month-status',
      householdId,
      period.year,
      period.month,
      templatesSignature,
    ],
    enabled: !!householdId && templates.length > 0,
    queryFn: async (): Promise<Map<string, boolean>> => {
      const dateIso = periodStartIso(period);
      const idToHash = await Promise.all(
        templates.map(async (t) => ({
          id: t.id,
          hash: await dedupeHash(t.account_id, dateIso, t.amount, t.description.trim()),
        })),
      );
      const uniqueHashes = [...new Set(idToHash.map((x) => x.hash))];
      if (uniqueHashes.length === 0) return new Map();

      const existing = new Set<string>();
      const CHUNK = 500;
      for (let i = 0; i < uniqueHashes.length; i += CHUNK) {
        const slice = uniqueHashes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('tf_transactions')
          .select('dedupe_hash')
          .eq('household_id', householdId!)
          .in('dedupe_hash', slice);
        if (error) throw error;
        for (const row of data ?? []) {
          existing.add((row as { dedupe_hash: string }).dedupe_hash);
        }
      }

      const out = new Map<string, boolean>();
      for (const { id, hash } of idToHash) {
        out.set(id, existing.has(hash));
      }
      return out;
    },
  });

  const naturalMonthQuery = useQuery({
    queryKey: ['recurring-month-natural-import', householdId, period.year, period.month],
    enabled: !!householdId,
    queryFn: () => fetchMonthHasNaturalImportedTransactions(householdId!, period),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(templates.map((t) => t.id)));
  }, [templates]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  function addTemplate(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!householdId) return;
    const description = draftDesc.trim();
    const amount = parsePastedAmount(draftAmount);
    if (!description || amount === null || !draftCategoryId || !draftAccountId) {
      setFeedback({
        tone: 'neg',
        text: 'Fill in description, amount, category, and account.',
      });
      return;
    }
    setTemplates((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description,
        amount,
        category_id: draftCategoryId,
        account_id: draftAccountId,
      },
    ]);
    setDraftDesc('');
    setDraftAmount('');
    setFeedback({ tone: 'pos', text: 'Template saved.' });
  }

  function removeTemplate(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function addSelectedToMonth() {
    setFeedback(null);
    if (!householdId || !user) {
      setFeedback({ tone: 'neg', text: 'Sign in and load your household first.' });
      return;
    }
    const schemeId = schemeQ.data;
    if (!schemeId) {
      setFeedback({ tone: 'neg', text: 'Could not load category scheme.' });
      return;
    }

    const selected = templates.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) {
      setFeedback({ tone: 'neg', text: 'Select at least one template.' });
      return;
    }

    setApplying(true);
    let inserted = 0;
    let skippedDup = 0;

    try {
      const eligible = await fetchMonthHasNaturalImportedTransactions(householdId, period);
      if (!eligible) {
        setFeedback({
          tone: 'neg',
          text: `Import bank or CSV transactions dated in ${formatPeriod(period)} before adding recurring rows for that month.`,
        });
        return;
      }

      const dateIso = periodStartIso(period);
      const periodLabel = formatPeriod(period);
      const byAccount = new Map<string, RecurringTemplate[]>();
      for (const t of selected) {
        const arr = byAccount.get(t.account_id) ?? [];
        arr.push(t);
        byAccount.set(t.account_id, arr);
      }

      for (const [accountId, group] of byAccount) {
        const parsedTxns: ParsedTransaction[] = group.map((t) => ({
          date: dateIso,
          description: t.description.trim(),
          amount: t.amount,
          raw_row: {},
        }));

        const previewRows = await buildRecurringPreviewRows({
          householdId,
          accountId,
          parsedTxns,
        });

        const zipped = group.map((template, i) => ({
          template,
          preview: previewRows[i]!,
        }));
        const toCommit = zipped.filter((z) => !z.preview.is_duplicate);
        skippedDup += zipped.length - toCommit.length;

        if (toCommit.length === 0) continue;

        const newRows = toCommit.map((z) => z.preview);
        const { inserted_ids } = await commitImport({
          household_id: householdId,
          account_id: accountId,
          source_file: `Recurring templates (${periodLabel})`,
          total_rows: newRows.length,
          new_rows: newRows,
          imported_by: user.id,
        });
        inserted += inserted_ids.length;

        const byCat = new Map<string, string[]>();
        for (let i = 0; i < inserted_ids.length; i++) {
          const tid = inserted_ids[i]!;
          const catId = toCommit[i]!.template.category_id;
          const arr = byCat.get(catId) ?? [];
          arr.push(tid);
          byCat.set(catId, arr);
        }
        for (const [catId, ids] of byCat) {
          await applyBulkAction(schemeId, ids, {
            type: 'set_category',
            category_id: catId,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['latest-actual-period-global'] });
      queryClient.invalidateQueries({
        queryKey: ['import-monthly-stats', householdId],
      });
      queryClient.invalidateQueries({
        queryKey: ['recurring-template-month-status', householdId],
      });
      queryClient.invalidateQueries({
        queryKey: ['recurring-month-natural-import', householdId],
      });

      if (inserted === 0) {
        if (skippedDup > 0) {
          setFeedback({
            tone: 'neg',
            text: `No new transactions — ${skippedDup} selected row${skippedDup === 1 ? '' : 's'} already match existing data for ${dateIso} (same account, date, amount, and description).`,
          });
        } else {
          setFeedback({ tone: 'neg', text: 'Nothing was added.' });
        }
      } else {
        const parts = [
          `Added ${inserted} transaction${inserted === 1 ? '' : 's'} for ${periodLabel} (${dateIso}).`,
        ];
        if (skippedDup > 0) {
          parts.push(
            `Skipped ${skippedDup} duplicate fingerprint${skippedDup === 1 ? '' : 's'} already in your data.`,
          );
        }
        setFeedback({ tone: 'pos', text: parts.join(' ') });
      }
      setSelectedIds(new Set());
    } catch (err) {
      setFeedback({
        tone: 'neg',
        text: (err as Error).message ?? 'Could not create transactions.',
      });
    } finally {
      setApplying(false);
    }
  }

  if (!household) {
    return (
      <Card className="p-6 text-sm text-gray-600">
        Load your household to manage recurring templates.
      </Card>
    );
  }

  const monthFirstLabel = periodStartIso(period);
  const selectedCount = selectedIds.size;
  const monthAllowsRecurring =
    naturalMonthQuery.isSuccess && naturalMonthQuery.data === true;
  const canApply =
    selectedCount > 0 &&
    !applying &&
    !!schemeQ.data &&
    !categoriesQ.isLoading &&
    !!user &&
    monthAllowsRecurring;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-body-base text-gray-500">
        Save reusable transaction patterns (description, amount, category, account). Select one or
        more templates and post them on the <strong>first day</strong> of the month shown in the app
        header (
        <strong>{formatPeriod(period)}</strong> →{' '}
        <span className="font-mono text-navy-800">{monthFirstLabel}</span>
        ). You can only add to months that already include at least one{' '}
        <strong>bank / CSV import</strong> transaction dated in that month (not recurring-only or
        plain manual rows).
      </p>

      {naturalMonthQuery.isPending && (
        <StatusPanel kind="loading" message="Checking import coverage for this month…" />
      )}
      {naturalMonthQuery.isError && (
        <StatusPanel
          kind="error"
          message="Could not verify whether this month has imported transactions."
          detail={(naturalMonthQuery.error as Error).message}
        />
      )}
      {naturalMonthQuery.isSuccess && !naturalMonthQuery.data && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <div className="font-semibold">
            No imported bank transactions for {formatPeriod(period)} yet
          </div>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Import a CSV dated in this month (Discover, Amex, or BCU) first. We detect coverage when
            at least one transaction in that month has bank-only fields (category from the file,
            card member, or the bank&apos;s transaction id). Then you can post recurring templates
            for {monthFirstLabel}.
          </p>
        </div>
      )}

      {schemeQ.isLoading && <StatusPanel kind="loading" message="Loading categories…" />}
      {schemeQ.isError && (
        <StatusPanel
          kind="error"
          message="Could not load your category scheme."
          detail={(schemeQ.error as Error).message}
        />
      )}

      {categoriesQ.isError && (
        <StatusPanel
          kind="error"
          message="Could not load categories."
          detail={(categoriesQ.error as Error).message}
        />
      )}

      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.tone === 'pos'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="border-b border-navy-100 bg-navy-50/60 px-4 py-2">
          <h2 className="text-sm font-semibold text-navy-800">New template</h2>
          <p className="mt-1 text-xs text-gray-600">
            Spending/outflows are <strong>positive</strong> amounts (same as manual import). Income
            uses negative amounts.
          </p>
        </div>
        <form
          onSubmit={addTemplate}
          className="flex flex-wrap items-end gap-3 border-b border-navy-100 px-4 py-3"
        >
          <label className="block min-w-[10rem] flex-1 text-xs font-semibold text-gray-600">
            Description
            <input
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="e.g. House cleaning"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            />
          </label>
          <label className="block w-[7rem] text-xs font-semibold text-gray-600">
            Amount
            <input
              value={draftAmount}
              inputMode="decimal"
              onChange={(e) => setDraftAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            />
          </label>
          <label className="block min-w-[11rem] flex-1 text-xs font-semibold text-gray-600">
            Category
            <select
              value={draftCategoryId}
              onChange={(e) => setDraftCategoryId(e.target.value)}
              disabled={!schemeQ.data || categories.length === 0}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="">— category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group_name ? `${c.group_name} › ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[11rem] flex-1 text-xs font-semibold text-gray-600">
            Account
            <select
              value={draftAccountId}
              onChange={(e) => setDraftAccountId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="">— account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({SOURCE_LABELS[a.source_type as SourceType]})
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" type="submit" disabled={!schemeQ.data}>
            Save template
          </Button>
        </form>
      </Card>

      <section className="overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 bg-navy-50/60 px-4 py-2">
          <div>
            <h2 className="text-sm font-semibold text-navy-800">Templates</h2>
            <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-gray-600">
              Each row shows whether a transaction matching this template already exists for{' '}
              <strong>{formatPeriod(period)}</strong> (posted on{' '}
              <span className="font-mono">{periodStartIso(period)}</span>). Matching uses the same
              fingerprint as import duplicate detection (account, date, amount, description). If it is
              already recorded, clicking Add will skip that row as a duplicate unless you change the
              template or existing data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" type="button" onClick={selectAll} disabled={templates.length === 0}>
              Select all
            </Button>
            <Button variant="secondary" type="button" onClick={selectNone} disabled={selectedCount === 0}>
              Clear selection
            </Button>
            <Button
              variant="accent"
              type="button"
              onClick={() => void addSelectedToMonth()}
              disabled={!canApply}
            >
              {applying ? 'Adding…' : `Add to ${formatPeriod(period)} (${selectedCount})`}
            </Button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No templates yet. Add one above — templates are saved in this browser for this household.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-navy-50/60 text-[11px] uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-center font-semibold w-10"></th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Category</th>
                  <th className="px-3 py-2 text-left font-semibold">Account</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-normal normal-case">
                    In data for {formatPeriod(period, 'short')}
                  </th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const cat = catById.get(t.category_id);
                  const acct = accounts.find((a) => a.id === t.account_id);
                  const catLabel = cat
                    ? cat.group_name
                      ? `${cat.group_name} › ${cat.name}`
                      : cat.name
                    : '(unknown category)';
                  const statusMap = monthPostedQuery.data;
                  let statusCell: ReactNode;
                  if (monthPostedQuery.isError) {
                    statusCell = (
                      <span className="text-xs text-neg" title={(monthPostedQuery.error as Error).message}>
                        Could not check
                      </span>
                    );
                  } else if (monthPostedQuery.isPending) {
                    statusCell = <span className="text-xs text-gray-400">Checking…</span>;
                  } else if (statusMap != null) {
                    const posted = statusMap.get(t.id) ?? false;
                    const alreadyTitle =
                      'A transaction with this account, the 1st of ' +
                      formatPeriod(period) +
                      ', this amount, and this description is already in your data. If you click Add again for this template, it will be skipped as a duplicate (same fingerprint as CSV imports). Change amount, description, or account—or adjust the existing transaction—if you truly need a second identical row.';
                    const notYetTitle =
                      'No transaction with this fingerprint for ' +
                      formatPeriod(period) +
                      ' yet. Adding will create a new row on ' +
                      periodStartIso(period) +
                      '.';
                    statusCell = posted ? (
                      <span className="inline-block" title={alreadyTitle}>
                        <Badge tone="warn">Already recorded</Badge>
                      </span>
                    ) : (
                      <span className="inline-block" title={notYetTitle}>
                        <Badge tone="neutral">Not added yet</Badge>
                      </span>
                    );
                  } else {
                    statusCell = <span className="text-xs text-gray-400">—</span>;
                  }
                  return (
                    <tr key={t.id} className="border-t border-navy-100 hover:bg-navy-50/30">
                      <td className="px-3 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                          className="h-4 w-4 rounded border-gray-300 text-navy-700 focus:ring-navy-200"
                        />
                      </td>
                      <td className="px-3 py-2 text-navy-900">{t.description}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800">
                        {t.amount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{catLabel}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {acct ? `${acct.name} (${SOURCE_LABELS[acct.source_type as SourceType]})` : '(account)'}
                      </td>
                      <td className="px-3 py-2 align-middle">{statusCell}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeTemplate(t.id)}
                          className="text-xs text-gray-400 hover:text-neg"
                          title="Remove template"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ImportTabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 pb-2 text-sm font-semibold transition-colors ${
        active ? 'text-navy-900' : 'text-gray-500 hover:text-navy-700'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-navy-700" />
      )}
    </button>
  );
}

const IMPORT_MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatImportMonthLabel(isoYmd: string): string {
  const d = new Date(`${isoYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoYmd;
  return IMPORT_MONTH_LABEL.format(d);
}

function ImportedDataTab({
  period,
  loading,
  error,
  rows,
}: {
  period: Period;
  loading: boolean;
  error: Error | null;
  rows: ImportMonthlyStatRow[];
}) {
  const { sensitive: privUsd } = usePrivacyUsdFormatters();
  const filterMonthIso = periodStartIso(period);
  const filteredRows = useMemo(
    () => rows.filter((r) => r.period_month === filterMonthIso),
    [rows, filterMonthIso],
  );

  const grouped = useMemo(() => {
    const byMonth = new Map<
      string,
      { month: string; items: ImportMonthlyStatRow[]; subCount: number; subSum: number }
    >();
    for (const r of filteredRows) {
      let g = byMonth.get(r.period_month);
      if (!g) {
        g = { month: r.period_month, items: [], subCount: 0, subSum: 0 };
        byMonth.set(r.period_month, g);
      }
      g.items.push(r);
      g.subCount += r.txn_count;
      g.subSum += r.amount_sum;
    }
    return Array.from(byMonth.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [filteredRows]);

  let grandCount = 0;
  let grandSum = 0;
  for (const r of filteredRows) {
    grandCount += r.txn_count;
    grandSum += r.amount_sum;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-body-base text-gray-500">
        For <strong>{formatPeriod(period)}</strong>, counts and net amounts by account using each
        row&apos;s <strong>transaction date</strong> (same month as the Monthly Report and the period
        control). Positive totals are more money out than in, matching the transaction grid.
      </p>

      {loading && <StatusPanel kind="loading" message="Loading imported data…" />}
      {!loading && error && (
        <StatusPanel kind="error" message="Couldn&apos;t load import summary." detail={error.message} />
      )}
      {!loading && !error && rows.length === 0 && (
        <Card className="p-6 text-sm text-gray-600">No transactions in your household yet.</Card>
      )}
      {!loading && !error && rows.length > 0 && filteredRows.length === 0 && (
        <Card className="p-6 text-sm text-gray-700">
          No transactions dated in <strong>{formatPeriod(period)}</strong>. Try another month above, or
          use the Import tab to add data.
        </Card>
      )}
      {!loading && !error && filteredRows.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-navy-50/60 text-[11px] uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Account</th>
                <th className="px-3 py-2 text-right font-semibold">Transactions</th>
                <th className="px-3 py-2 text-right font-semibold">Net amount</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.month}>
                  <tr className="bg-navy-50/80">
                    <td
                      colSpan={3}
                      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-navy-800"
                    >
                      {formatImportMonthLabel(g.month)}
                    </td>
                  </tr>
                  {g.items.map((r) => (
                    <tr key={`${r.period_month}|${r.account_id}`} className="border-t border-navy-100">
                      <td className="px-3 py-2 text-navy-800">{r.account_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                        {r.txn_count.toLocaleString()}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${r.amount_sum < 0 ? 'text-pos' : 'text-gray-900'}`}
                      >
                        {privUsd(r.amount_sum, { decimals: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-navy-100 bg-navy-50/40 text-xs font-semibold text-navy-800">
                    <td className="px-3 py-1.5">Subtotal</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {g.subCount.toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${g.subSum < 0 ? 'text-pos' : ''}`}
                    >
                      {privUsd(g.subSum, { decimals: 2 })}
                    </td>
                  </tr>
                </Fragment>
              ))}
              <tr className="border-t-2 border-navy-700 bg-navy-800 font-bold text-white">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {grandCount.toLocaleString()}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${grandSum < 0 ? 'text-emerald-200' : ''}`}
                >
                  {privUsd(grandSum, { decimals: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function ManualImportSection({
  accounts,
  manualImport,
  onAccountChange,
  onRowChange,
  onPasteFromClipboard,
  onAddRows,
  onRemoveRow,
  onClear,
  stats,
  onShowDups,
}: {
  accounts: Array<{ id: string; name: string; source_type: string }>;
  manualImport: ManualImportState;
  onAccountChange: (account_id: string | null) => void;
  onRowChange: (id: string, patch: Partial<ManualGridRow>) => void;
  onPasteFromClipboard: (rowIdx: number, colIdx: number, text: string) => void;
  onAddRows: () => void;
  onRemoveRow: (id: string) => void;
  onClear: () => void;
  stats: FileStats | null;
  onShowDups: () => void;
}) {
  const nonBlankCount = manualImport.rows.filter((r) => !isManualRowBlank(r)).length;

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="border-b border-navy-100 bg-navy-50/60 px-4 py-2">
        <h2 className="text-sm font-semibold text-navy-800">Add transactions manually</h2>
        <p className="mt-1 text-xs text-gray-600">
          Spreadsheet-style grid: use <strong>Tab</strong> to move across cells. Paste from Excel or
          Google Sheets (tab-separated columns: date, description, amount). Dates: YYYY-MM-DD or
          M/D/YYYY. Amounts match imports (spending/outflows positive; income negative). Optional{' '}
          <code className="text-[11px]">$</code> and parentheses for negatives.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-navy-100 px-4 py-3">
        <label className="block min-w-[12rem] flex-1 text-xs font-semibold text-gray-600">
          Account
          <select
            value={manualImport.account_id ?? ''}
            onChange={(e) => onAccountChange(e.target.value || null)}
            className={`mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 ${
              manualImport.account_id ? 'border-gray-300' : 'border-warn'
            }`}
          >
            <option value="">— pick account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({SOURCE_LABELS[a.source_type as SourceType]})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" type="button" onClick={onAddRows}>
            Add row
          </Button>
          <Button variant="secondary" type="button" onClick={onClear}>
            Clear table
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-navy-50/60 text-[11px] uppercase tracking-wider text-gray-600">
            <tr>
              <th className="border-b border-navy-100 px-2 py-2 text-left font-semibold">Date</th>
              <th className="border-b border-navy-100 px-2 py-2 text-left font-semibold">
                Description
              </th>
              <th className="border-b border-navy-100 px-2 py-2 text-right font-semibold">Amount</th>
              <th className="border-b border-navy-100 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {manualImport.rows.map((row, rowIdx) => (
              <tr key={row.id} className="border-b border-navy-100 hover:bg-navy-50/30">
                <td className="border-r border-navy-100 p-0 align-top">
                  <input
                    value={row.date}
                    onChange={(e) => onRowChange(row.id, { date: e.target.value })}
                    onPaste={(e) => {
                      e.preventDefault();
                      onPasteFromClipboard(rowIdx, 0, e.clipboardData.getData('text/plain'));
                    }}
                    placeholder="YYYY-MM-DD"
                    className="w-full min-w-[7rem] bg-transparent px-2 py-2 font-mono text-xs text-navy-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-200"
                  />
                </td>
                <td className="border-r border-navy-100 p-0 align-top">
                  <input
                    value={row.description}
                    onChange={(e) => onRowChange(row.id, { description: e.target.value })}
                    onPaste={(e) => {
                      e.preventDefault();
                      onPasteFromClipboard(rowIdx, 1, e.clipboardData.getData('text/plain'));
                    }}
                    placeholder="Payee / memo"
                    className="w-full min-w-[12rem] bg-transparent px-2 py-2 text-navy-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-200"
                  />
                </td>
                <td className="border-r border-navy-100 p-0 align-top">
                  <input
                    value={row.amount}
                    inputMode="decimal"
                    onChange={(e) => onRowChange(row.id, { amount: e.target.value })}
                    onPaste={(e) => {
                      e.preventDefault();
                      onPasteFromClipboard(rowIdx, 2, e.clipboardData.getData('text/plain'));
                    }}
                    placeholder="0.00"
                    className="w-full min-w-[6rem] bg-transparent px-2 py-2 text-right font-mono text-xs tabular-nums text-navy-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-200"
                  />
                </td>
                <td className="w-8 p-0 align-top text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.id)}
                    className="px-2 py-2 text-xs text-gray-400 hover:text-neg"
                    title="Remove row"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-navy-50/40 px-4 py-2 text-xs text-gray-700">
        <div>
          <span className="font-semibold text-navy-800">{nonBlankCount}</span> non-empty{' '}
          {nonBlankCount === 1 ? 'row' : 'rows'}
        </div>
        {stats && (
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <span className="text-pos">
              New: <strong>{stats.newCount}</strong>
            </span>
            <span className="text-gray-600">
              Dup:{' '}
              {stats.dupCount > 0 ? (
                <button
                  type="button"
                  onClick={onShowDups}
                  className="font-semibold underline-offset-2 hover:text-navy-800 hover:underline"
                >
                  {stats.dupCount}
                </button>
              ) : (
                <strong>{stats.dupCount}</strong>
              )}
            </span>
            <span className="text-cat-travel">
              Trip: <strong>{stats.tripTaggedCount}</strong>
            </span>
            {manualImport.status === 'ready' && <Badge tone="pos">Ready</Badge>}
            {manualImport.status === 'error' && <Badge tone="neg">Error</Badge>}
          </div>
        )}
      </div>
      {manualImport.status === 'error' && manualImport.errorMessage && (
        <div className="border-t border-navy-100 px-4 py-2 text-xs text-neg">{manualImport.errorMessage}</div>
      )}
    </section>
  );
}

// ============================================================================
// File row
// ============================================================================

function FileTableRow({
  file,
  stats,
  accounts,
  onChange,
  onRemove,
  onShowDups,
  onImportFamaFrench,
}: {
  file: FileRow;
  /** Override-aware counts for this file. `null` while not yet ready. */
  stats: FileStats | null;
  accounts: Array<{ id: string; name: string; source_type: string }>;
  onChange: (patch: Partial<FileRow>) => void;
  onRemove: () => void;
  onShowDups: () => void;
  onImportFamaFrench?: () => void;
}) {
  const isFf = file.source === 'fama_french';

  if (isFf) {
    const ff = file.ffParsed;
    return (
      <tr className="border-t border-navy-100 hover:bg-navy-50/40">
        <td className="px-3 py-2 text-left">
          <div className="font-mono text-xs text-navy-800">{file.fileName}</div>
        </td>
        <td className="px-3 py-2 text-left">
          <span className="rounded bg-navy-100 px-2 py-1 text-xs font-semibold text-navy-700">
            Fama-French 3-Factor
          </span>
        </td>
        <td className="px-3 py-2 text-left text-xs text-gray-500">
          {ff ? `${ff.monthCount} months` : '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {ff ? ff.rowCount : 0}
        </td>
        <td colSpan={4} className="px-3 py-2 text-center">
          {file.status === 'pending' && ff && (
            onImportFamaFrench ? (
              <button
                onClick={onImportFamaFrench}
                className="rounded-md bg-navy-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-navy-700"
              >
                Import {ff.monthCount} months
              </button>
            ) : (
              <span className="text-xs text-gray-400">Loading…</span>
            )
          )}
          {file.status === 'ready' && (
            <Badge tone="pos">Imported</Badge>
          )}
          {file.status === 'error' && file.errorMessage && (
            <span className="text-xs text-neg">{file.errorMessage}</span>
          )}
          {file.status === 'error' && !file.errorMessage && (
            <Badge tone="neg">Error</Badge>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <button onClick={onRemove} className="text-xs text-gray-400 hover:text-neg" title="Remove this file">×</button>
        </td>
      </tr>
    );
  }

  // Filter accounts to ones matching the current source. The dropdown still
  // shows ALL accounts as an "other" group so the user can override an
  // auto-detect mistake (e.g. force a Discover CSV onto the Amex account).
  const matching = file.source
    ? accounts.filter((a) => a.source_type === file.source)
    : [];
  const others = file.source
    ? accounts.filter((a) => a.source_type !== file.source)
    : accounts;

  const isAutoDetected = file.detectedSource === file.source;

  return (
    <tr className="border-t border-navy-100 hover:bg-navy-50/40">
      <td className="px-3 py-2 text-left">
        <div className="font-mono text-xs text-navy-800">{file.fileName}</div>
      </td>
      <td className="px-3 py-2 text-left">
        <select
          value={file.source ?? ''}
          onChange={(e) =>
            onChange({ source: (e.target.value || null) as SourceType | null })
          }
          className={`rounded-md border bg-white px-2 py-1 text-xs focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 ${
            isAutoDetected ? 'border-gray-300' : 'border-warn'
          }`}
        >
          <option value="">— pick —</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
              {file.detectedSource === s ? ' (auto)' : ''}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-left">
        <select
          value={file.account_id ?? ''}
          onChange={(e) => onChange({ account_id: e.target.value || null })}
          className={`rounded-md border bg-white px-2 py-1 text-xs focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200 ${
            file.account_id ? 'border-gray-300' : 'border-warn'
          }`}
        >
          <option value="">— pick —</option>
          {matching.length > 0 && (
            <optgroup label="Matching">
              {matching.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other accounts">
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({SOURCE_LABELS[a.source_type as SourceType]})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{file.parsedTxns.length}</td>
      <td className="px-3 py-2 text-right tabular-nums text-pos">
        {stats ? stats.newCount : '—'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
        {stats && stats.dupCount > 0 ? (
          <button
            onClick={onShowDups}
            className="underline-offset-2 hover:text-navy-800 hover:underline"
            title="Click to review duplicates and override flagged rows"
          >
            {stats.dupCount}
          </button>
        ) : stats ? (
          stats.dupCount
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-cat-travel">
        {stats ? stats.tripTaggedCount : '—'}
      </td>
      <td className="px-3 py-2 text-left">
        <FileStatusBadge file={file} />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onRemove}
          className="text-xs text-gray-400 hover:text-neg"
          title="Remove this file"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function FileStatusBadge({ file }: { file: FileRow }) {
  if (file.status === 'error') {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge tone="neg">Error</Badge>
        {file.errorMessage && (
          <span
            className="max-w-xs whitespace-normal text-[11px] leading-tight text-neg"
            title={file.errorMessage}
          >
            {file.errorMessage}
          </span>
        )}
      </div>
    );
  }
  if (file.status === 'ready') {
    return <Badge tone="pos">Ready</Badge>;
  }
  if (!file.source || !file.account_id) {
    return <Badge tone="warn">Needs setup</Badge>;
  }
  return <Badge tone="neutral">Pending preview</Badge>;
}

// ============================================================================
// File drop (multi-file)
// ============================================================================

function FileDrop({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const fs = Array.from(e.dataTransfer.files);
        if (fs.length > 0) onFiles(fs);
      }}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        hover ? 'border-navy-500 bg-navy-50' : 'border-gray-300 bg-white hover:border-navy-300 hover:bg-navy-50/30'
      }`}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length > 0) onFiles(fs);
          e.currentTarget.value = '';
        }}
      />
      <div className="text-navy-800 font-semibold">
        Drop one or more CSV files here, or click to choose
      </div>
      <div className="mt-1 text-xs text-gray-500">
        Discover, Amex, BCU Cash Rewards Visa, BCU Powerplus
      </div>
    </div>
  );
}

// ============================================================================
// Confirm modal
// ============================================================================

function ConfirmModal({
  files,
  statsByFile,
  grandNew,
  grandDup,
  grandTrip,
  overrideCount,
  onConfirm,
  onCancel,
  committing,
}: {
  files: FileRow[];
  statsByFile: Map<string, FileStats>;
  grandNew: number;
  grandDup: number;
  grandTrip: number;
  overrideCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  committing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-xl">
        <h3 className="mb-3 text-h2 text-navy-900">Confirm import</h3>
        <p className="mb-3 text-sm text-gray-700">
          About to commit <strong>{files.length}</strong>{' '}
          {files.length === 1 ? 'file' : 'files'} (one batch per file):
        </p>
        <ul className="mb-4 max-h-44 space-y-1 overflow-auto text-xs">
          {files.map((f) => {
            const s = statsByFile.get(f.id);
            return (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-md bg-navy-50 px-2 py-1"
              >
                <span className="truncate font-mono">{f.fileName}</span>
                <span className="ml-2 shrink-0 font-semibold text-pos">
                  {s?.newCount ?? 0} new
                </span>
              </li>
            );
          })}
        </ul>
        <ul className="mb-4 space-y-1 text-sm text-gray-700">
          <li>
            • <strong>{grandNew}</strong> new transactions
            {overrideCount > 0 && (
              <span className="text-warn">
                {' '}
                (incl. {overrideCount} duplicate
                {overrideCount === 1 ? '' : 's'} you chose to import)
              </span>
            )}
          </li>
          <li>
            • <strong>{grandDup}</strong> duplicates skipped
          </li>
          <li>
            • <strong>{grandTrip}</strong> tagged with a trip
          </li>
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={committing}>
            {committing ? 'Committing…' : 'Confirm & commit'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Duplicates panel — review flagged duplicates and override
// ============================================================================

/**
 * Shown below the action bar when the user clicks a Dup count. Lists every
 * row the preview flagged as a duplicate (for one file or for all files at
 * once), with an "Include anyway" checkbox per row.
 *
 * Clicking the checkbox flips the row's hash in the page-level
 * `includedDuplicateHashes` Set; the file's New / Dup counts update
 * automatically because they're derived from that Set on every render.
 *
 * Why per-row, not per-file: a single file can have multiple duplicates and
 * the user may want to keep some (legitimate refunds) while skipping others
 * (actual repeat imports). Per-row checkboxes are the smallest unit that
 * makes that distinction.
 */
function DuplicatesPanel({
  files,
  statsByFile,
  scope,
  includedDuplicateHashes,
  onToggle,
  onClose,
  onScopeChange,
}: {
  files: FileRow[];
  statsByFile: Map<string, FileStats>;
  /** `'all'` for the cross-file panel, or a specific file id. */
  scope: string | 'all';
  includedDuplicateHashes: Set<string>;
  onToggle: (hash: string) => void;
  onClose: () => void;
  onScopeChange: (scope: string | 'all') => void;
}) {
  // Build a flat list of duplicate rows, tagged with which file they came
  // from. We pull from `previewRows` (not `effectiveDupRows`) so the
  // already-overridden rows still appear with the box checked — otherwise
  // checking the box would make the row vanish, which is confusing.
  const flat: Array<{ file: FileRow; row: ImportPreviewRow }> = [];
  for (const f of files) {
    if (scope !== 'all' && f.id !== scope) continue;
    for (const r of f.previewRows ?? []) {
      if (r.is_duplicate) flat.push({ file: f, row: r });
    }
  }

  const scopedFile = scope === 'all' ? null : files.find((f) => f.id === scope);
  const overridesInScope = flat.filter((x) =>
    includedDuplicateHashes.has(x.row.dedupe_hash),
  ).length;

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-navy-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 bg-navy-50/60 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-navy-800">
            Duplicates
            {scopedFile ? (
              <span className="ml-1 font-mono text-xs font-normal text-gray-500">
                — {scopedFile.fileName}
              </span>
            ) : (
              <span className="ml-1 text-xs font-normal text-gray-500">
                — all files
              </span>
            )}
          </h2>
          <span className="text-xs text-gray-500">
            {flat.length} flagged · {overridesInScope} marked include
          </span>
          {files.length > 1 && (
            <select
              value={scope}
              onChange={(e) => onScopeChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
            >
              <option value="all">All files</option>
              {files
                .filter((f) => (statsByFile.get(f.id)?.dupCount ?? 0) > 0 || f.id === scope)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
            </select>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-navy-800"
        >
          Close
        </button>
      </div>

      {flat.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500">
          No duplicates in this scope.
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-navy-50/90 text-[11px] uppercase tracking-wider text-gray-600 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 text-center font-semibold">Include</th>
                {scope === 'all' && <th className="px-3 py-2 text-left font-semibold">File</th>}
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Description</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Why flagged</th>
              </tr>
            </thead>
            <tbody>
              {flat.map(({ file, row }) => {
                const checked = includedDuplicateHashes.has(row.dedupe_hash);
                const matches = row.duplicate_matches ?? [];
                const colSpan = scope === 'all' ? 6 : 5;
                return (
                  <DuplicateRowGroup
                    key={`${file.id}|${row.dedupe_hash}`}
                    file={file}
                    row={row}
                    matches={matches}
                    checked={checked}
                    showFile={scope === 'all'}
                    matchesColSpan={colSpan}
                    onToggle={() => onToggle(row.dedupe_hash)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * One duplicate + its inline "what it matched against" sub-rows. Rendered as
 * the duplicate itself plus an indented sub-table of every existing row
 * (DB or earlier-in-batch) that triggered the flag. Showing the actual
 * matches answers "are these really dups?" without making the user go
 * search through the data themselves.
 */
function DuplicateRowGroup({
  file,
  row,
  matches,
  checked,
  showFile,
  matchesColSpan,
  onToggle,
}: {
  file: FileRow;
  row: ImportPreviewRow;
  matches: DuplicateMatch[];
  checked: boolean;
  showFile: boolean;
  matchesColSpan: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`border-t border-navy-100 ${
          checked ? 'bg-gold-100/60' : 'hover:bg-navy-50/40'
        }`}
      >
        <td className="px-3 py-1.5 text-center align-top">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            title="Mark as not a duplicate — will be inserted on commit"
          />
        </td>
        {showFile && (
          <td className="px-3 py-1.5 text-left align-top font-mono text-xs text-gray-500">
            {file.fileName}
          </td>
        )}
        <td className="px-3 py-1.5 text-left align-top font-mono text-gray-700">
          {row.parsed.date}
        </td>
        <td className="max-w-md truncate px-3 py-1.5 text-left align-top text-gray-800">
          {row.parsed.description}
        </td>
        <td className="px-3 py-1.5 text-right align-top tabular-nums text-gray-800">
          {row.parsed.amount.toFixed(2)}
        </td>
        <td className="px-3 py-1.5 text-left align-top">
          <DuplicateReasonBadge type={row.duplicate_match_type} />
        </td>
      </tr>
      {matches.length > 0 && (
        <tr className={checked ? 'bg-gold-100/40' : ''}>
          <td className="border-l-2 border-navy-300 bg-navy-50/60 px-0 py-0"></td>
          <td colSpan={matchesColSpan} className="bg-navy-50/60 px-3 py-2">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-600">
              Matches against {matches.length}{' '}
              {matches.length === 1 ? 'row' : 'rows'}
            </div>
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-1 pr-3 text-left font-semibold">Source</th>
                  <th className="py-1 pr-3 text-left font-semibold">Date</th>
                  <th className="py-1 pr-3 text-left font-semibold">Description</th>
                  <th className="py-1 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-1 pr-3 text-left font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, idx) => (
                  <tr key={idx} className="border-t border-navy-100">
                    <td className="py-1 pr-3 align-top">
                      <MatchSourceBadge match={m} />
                    </td>
                    <td className="py-1 pr-3 align-top font-mono">{m.date}</td>
                    <td className="py-1 pr-3 align-top text-gray-700">{m.description}</td>
                    <td className="py-1 pr-3 text-right align-top tabular-nums">
                      {m.amount.toFixed(2)}
                    </td>
                    <td className="py-1 pr-3 align-top text-gray-500">
                      <MatchDetail match={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function MatchSourceBadge({ match }: { match: DuplicateMatch }) {
  if (match.source === 'db') {
    return (
      <span
        className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700"
        title="Already in the database from a previous import"
      >
        Existing
      </span>
    );
  }
  return (
    <span
      className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info"
      title="Earlier row in this same import batch"
    >
      In batch
    </span>
  );
}

function MatchDetail({ match }: { match: DuplicateMatch }) {
  if (match.source === 'db') {
    if (match.imported_at) {
      const d = new Date(match.imported_at);
      return (
        <span title={`Existing transaction ${match.txn_id ?? ''}`}>
          Imported {d.toLocaleDateString()}
        </span>
      );
    }
    return <span>Existing transaction</span>;
  }
  // batch
  return (
    <span className="font-mono" title={match.file_name}>
      {match.file_name}
    </span>
  );
}

function DuplicateReasonBadge({
  type,
}: {
  type: ImportPreviewRow['duplicate_match_type'];
}) {
  if (type === 'external_id') {
    return (
      <Badge tone="neg">
        <span title="A transaction with this exact bank-issued Transaction ID is already in the database.">
          Same ID
        </span>
      </Badge>
    );
  }
  if (type === 'hash') {
    return (
      <Badge tone="warn">
        <span title="A transaction with the same (account, date, amount, description) already exists.">
          Same fingerprint
        </span>
      </Badge>
    );
  }
  return <Badge tone="neutral">Duplicate</Badge>;
}

