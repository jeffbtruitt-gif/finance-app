import type { RuleCondition } from '@/types/phase2';

/**
 * Single AND-condition row for rule builders (full page + inline Rules editor).
 */
export function ConditionEditor({
  condition,
  onChange,
  onRemove,
}: {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const sel =
    'h-9 w-36 rounded-md border border-gray-300 bg-white px-2 text-[13px] focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20';
  const inp =
    'h-9 rounded-md border border-gray-300 bg-white px-2 text-[13px] focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={sel}
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value as RuleCondition['field'];
          if (field === 'description') {
            onChange({ field, op: 'contains', value: '', case_insensitive: true });
          } else if (field === 'amount') {
            onChange({ field, op: 'eq', value: 0 });
          } else {
            onChange({ field, op: 'is', value: '' });
          }
        }}
      >
        <option value="description">description</option>
        <option value="amount">amount</option>
        <option value="account">account</option>
      </select>

      {condition.field === 'description' && (
        <>
          <select
            className={sel}
            value={condition.op}
            onChange={(e) => onChange({ ...condition, op: e.target.value as 'contains' | 'equals' | 'starts_with' | 'regex' })}
          >
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="starts_with">starts with</option>
            <option value="regex">regex</option>
          </select>
          <input
            className={`${inp} min-w-[200px] flex-1`}
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="pattern"
          />
        </>
      )}

      {condition.field === 'amount' && condition.op === 'between' && (
        <>
          <span className="text-sm text-gray-600">between</span>
          <input
            type="number"
            step="0.01"
            className={`${inp} w-24 tabular-nums`}
            value={condition.min}
            onChange={(e) => onChange({ ...condition, min: parseFloat(e.target.value) || 0 })}
          />
          <span className="text-sm text-gray-600">and</span>
          <input
            type="number"
            step="0.01"
            className={`${inp} w-24 tabular-nums`}
            value={condition.max}
            onChange={(e) => onChange({ ...condition, max: parseFloat(e.target.value) || 0 })}
          />
        </>
      )}

      {condition.field === 'amount' && condition.op !== 'between' && (
        <>
          <select
            className={sel}
            value={condition.op}
            onChange={(e) => {
              const op = e.target.value;
              if (op === 'between') {
                onChange({ field: 'amount', op: 'between', min: 0, max: 0 });
              } else {
                onChange({
                  field: 'amount',
                  op: op as 'eq' | 'gt' | 'lt',
                  value: (condition as { value?: number }).value ?? 0,
                });
              }
            }}
          >
            <option value="eq">=</option>
            <option value="gt">&gt;</option>
            <option value="lt">&lt;</option>
            <option value="between">between</option>
          </select>
          <input
            type="number"
            step="0.01"
            className={`${inp} w-32 tabular-nums`}
            value={(condition as { value: number }).value}
            onChange={(e) =>
              onChange({
                ...condition,
                value: parseFloat(e.target.value) || 0,
              } as RuleCondition)
            }
          />
        </>
      )}

      {condition.field === 'account' && (
        <>
          <span className="text-sm text-gray-600">is</span>
          <input
            className={`${inp} min-w-[120px] flex-1`}
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="e.g., Discover"
          />
        </>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="h-9 px-2 text-neg hover:underline"
        title="Remove condition"
      >
        ×
      </button>
    </div>
  );
}
