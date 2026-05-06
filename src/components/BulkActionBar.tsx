import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { defaultSchemeQueryKey, fetchDefaultSchemeId } from '@/api/reports';
import { applyBulkAction } from '../api/phase2';
import type { BulkAction } from '../types/phase2';
import { RULE_BUILDER_FROM_IDS_KEY } from '@/lib/ruleBuilderNavigation';

/**
 * Bulk action toolbar. Renders inline at the top of the transaction grid
 * when 1+ rows are selected. Shows count and offers:
 *   - Set category
 *   - Set/clear trip
 *   - Set/clear tag
 *   - Delete (with confirm)
 *   - Make rule from these → /rules/new with location state (avoids URL length limits)
 *
 * Drop into TransactionsPage like:
 *   {selectedIds.length > 0 && (
 *     <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />
 *   )}
 */

export function BulkActionBar({
  selectedIds, onClear,
}: { selectedIds: string[]; onClear: () => void }) {
  const queryClient = useQueryClient();
  const household = useHousehold();
  const navigate = useNavigate();
  const [action, setAction] = useState<'category' | 'trip' | 'tag' | null>(null);

  const schemeQuery = useQuery({
    queryKey: defaultSchemeQueryKey(household?.id),
    enabled: !!household?.id,
    queryFn: () => fetchDefaultSchemeId(household!.id),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', schemeQuery.data],
    enabled: !!schemeQuery.data && action === 'category',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_categories')
        .select('id, name, group_name')
        .eq('scheme_id', schemeQuery.data!)
        .eq('status', 'active')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const tripsQuery = useQuery({
    queryKey: ['trips', household?.id],
    enabled: !!household?.id && action === 'trip',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tf_trips')
        .select('id, name')
        .eq('household_id', household!.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const applyMut = useMutation({
    mutationFn: async (act: BulkAction) => {
      if (!schemeQuery.data) throw new Error('No scheme');
      await applyBulkAction(schemeQuery.data, selectedIds, act);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_categories'] });
      onClear();
      setAction(null);
    },
  });

  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-1 rounded-lg bg-navy-800 px-4 py-2 text-sm text-white shadow-md">
      <span className="mr-3 font-semibold">
        <span className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-navy-900">
          {selectedIds.length}
        </span>
        <span className="ml-2">selected</span>
      </span>

      <BarBtn onClick={() => setAction(action === 'category' ? null : 'category')}>
        Set category
      </BarBtn>
      <BarBtn onClick={() => setAction(action === 'trip' ? null : 'trip')}>
        Set trip
      </BarBtn>
      <BarBtn
        onClick={() => {
          const tag = prompt('Tag (leave blank to clear):') ?? '';
          applyMut.mutate({ type: 'set_tag', tag: tag.trim() || null });
        }}
      >
        Set tag
      </BarBtn>
      <BarBtn
        onClick={() =>
          navigate('/rules/new', {
            state: { [RULE_BUILDER_FROM_IDS_KEY]: selectedIds },
          })
        }
      >
        Make rule from these
      </BarBtn>
      <BarBtn
        danger
        onClick={() => {
          if (
            confirm(
              `Delete ${selectedIds.length} transactions? This cannot be undone.`,
            )
          ) {
            applyMut.mutate({ type: 'delete' });
          }
        }}
      >
        Delete
      </BarBtn>
      <BarBtn className="ml-auto" onClick={onClear}>
        Clear
      </BarBtn>

      {action === 'category' && (
        <div className="absolute left-4 top-full mt-1 max-h-72 min-w-[240px] overflow-auto rounded-md border border-navy-100 bg-white p-2 text-gray-900 shadow-lg">
          {categoriesQuery.data?.map((c) => (
            <button
              key={c.id}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-navy-50"
              onClick={() =>
                applyMut.mutate({ type: 'set_category', category_id: c.id })
              }
            >
              <span className="text-xs text-gray-500">{c.group_name}</span> {c.name}
            </button>
          ))}
        </div>
      )}

      {action === 'trip' && (
        <div className="absolute left-32 top-full mt-1 max-h-72 min-w-[240px] overflow-auto rounded-md border border-navy-100 bg-white p-2 text-gray-900 shadow-lg">
          <button
            className="block w-full rounded px-2 py-1 text-left text-sm italic text-gray-500 hover:bg-navy-50"
            onClick={() => applyMut.mutate({ type: 'set_trip', trip_id: null })}
          >
            Clear trip
          </button>
          {tripsQuery.data?.map((t) => (
            <button
              key={t.id}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-navy-50"
              onClick={() => applyMut.mutate({ type: 'set_trip', trip_id: t.id })}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  danger,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        danger
          ? 'text-neg-soft hover:bg-neg/30'
          : 'text-navy-100 hover:bg-navy-700'
      } ${className}`}
    >
      {children}
    </button>
  );
}
