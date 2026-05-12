/**
 * "Needs your attention" — 3-up callout cards showing actionable signals.
 */

import { Link } from 'react-router-dom';

export interface AttentionSignal {
  key: string;
  tone: 'warn' | 'neg' | 'info';
  title: string;
  detail: string;
  cta: string;
  to: string;
}

const TONE_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  warn: { bg: 'bg-warn-soft/40', border: 'border-warn/30', dot: 'bg-warn' },
  neg: { bg: 'bg-neg-soft/40', border: 'border-neg/30', dot: 'bg-neg' },
  info: { bg: 'bg-info-soft/40', border: 'border-info/30', dot: 'bg-info' },
};

export function AttentionInbox({ signals }: { signals: AttentionSignal[] }) {
  if (signals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {signals.map((s) => {
        const t = TONE_STYLES[s.tone] ?? TONE_STYLES.info;
        return (
          <div
            key={s.key}
            className={`rounded-lg border ${t.border} ${t.bg} px-4 py-3`}
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${t.dot}`} />
              <span className="text-sm font-semibold text-navy-900">
                {s.title}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-gray-600">{s.detail}</div>
            <Link
              to={s.to}
              className="mt-2 inline-block text-[12px] font-semibold text-navy-700 hover:text-navy-900"
            >
              {s.cta} →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
