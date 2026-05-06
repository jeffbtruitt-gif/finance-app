import { useEffect, useMemo, useState } from 'react';
import { Button, categoryColorHex } from '@/components/ds';
import type { CategoryRow as Cat } from '@/api/categories';
import {
  ALL_GROUPS,
  CATEGORY_COLOR_PALETTE,
  SPEND_GROUPS_FOR_LABEL,
} from '@/features/categories/constants';
import { CategoryInUseError, deleteCategory } from '@/api/categories';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <div className="text-label mb-1.5 uppercase text-gray-600">{label}</div>
      {children}
      {hint && <div className="text-caption mt-1 text-gray-500">{hint}</div>}
    </label>
  );
}

export type DrawerMode = { mode: 'new'; presetGroup?: string | null } | { mode: 'edit'; category: Cat };

export function CategoryEditDrawer(props: {
  open: boolean;
  mode: DrawerMode;
  schemeId: string;
  categories: Cat[];
  onClose: () => void;
  onSave: (payload: {
    name: string;
    group_name: string | null;
    is_yearly: boolean;
    quick_assign: boolean;
    color_override: string | null;
  }) => Promise<void>;
  onOpenMerge: (source: Cat) => void;
  toast: (msg: string) => void;
}) {
  const { open, mode, categories, onClose, onSave, onOpenMerge, toast } = props;
  const editing = mode.mode === 'edit' ? mode.category : null;

  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState<string | null>('Income');
  const [isYearly, setIsYearly] = useState(false);
  const [quickAssign, setQuickAssign] = useState(false);
  const [colorOverride, setColorOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode.mode === 'edit') {
      const c = mode.category;
      setName(c.name);
      setGroupName(c.group_name);
      setIsYearly(c.is_yearly);
      setQuickAssign(!!c.quick_assign);
      setColorOverride(c.color_override ?? null);
    } else {
      setName('');
      if (mode.presetGroup === undefined) setGroupName('Income');
      else if (mode.presetGroup === null || mode.presetGroup === '') setGroupName(null);
      else setGroupName(mode.presetGroup);
      setIsYearly(false);
      setQuickAssign(false);
      setColorOverride(null);
    }
  }, [open, mode]);

  const conflict = useMemo(() => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return (
      categories.find(
        (c) =>
          c.status === 'active' &&
          c.id !== editing?.id &&
          c.name.trim().toLowerCase() === n,
      ) ?? null
    );
  }, [categories, name, editing?.id]);

  const canSave = name.trim().length > 0 && !conflict && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        group_name: groupName,
        is_yearly: isYearly,
        quick_assign: quickAssign,
        color_override: colorOverride,
      });
      onClose();
    } catch (e) {
      console.error(e);
      toast('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    try {
      await deleteCategory(editing.id);
      toast(`Deleted "${editing.name}"`);
      onClose();
    } catch (e) {
      if (e instanceof CategoryInUseError) {
        onOpenMerge(editing);
        onClose();
        return;
      }
      console.error(e);
      toast('Delete failed.');
    }
  }

  if (!open) return null;

  const swatch = colorOverride ?? categoryColorHex(name || 'x');

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} aria-hidden />
      <aside
        className={`absolute right-0 top-0 flex h-full w-[460px] flex-col border-l border-navy-100 bg-white shadow-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between border-b border-navy-100 px-5 py-4">
          <div>
            <h2 className="text-h3 text-navy-900">
              {editing ? 'Edit category' : 'New category'}
            </h2>
            {!editing && (
              <p className="text-caption text-gray-500">
                Add a new category to the default scheme
              </p>
            )}
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-navy-50"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Field label="Name" hint="Shown in transactions, reports, and budgets.">
            <input
              className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-900 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {conflict && (
              <div className="text-caption mt-1 text-neg">
                A category named &quot;{conflict.name}&quot; already exists in{' '}
                {conflict.group_name ?? 'no group'}.
              </div>
            )}
          </Field>

          <Field
            label="Group"
            hint="Determines which report section the category lives in."
          >
            <div className="grid grid-cols-2 gap-2">
              {ALL_GROUPS.map((g) => {
                const selected = groupName === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupName(g)}
                    className={
                      'rounded-md border px-3 py-2 text-left text-sm transition-colors ' +
                      (selected
                        ? 'border-navy-500 bg-navy-50 font-semibold text-navy-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-navy-200')
                    }
                  >
                    {g}
                    <div className="text-[10px] font-normal text-gray-500">
                      {SPEND_GROUPS_FOR_LABEL.has(g)
                        ? 'spend'
                        : 'excluded from spend total'}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={
                'mt-2 w-full rounded-md border py-2 text-sm transition-colors ' +
                (groupName === null
                  ? 'border-navy-500 bg-navy-50 font-semibold text-navy-800'
                  : 'border-dashed border-gray-300 text-gray-600 hover:border-navy-200 hover:text-navy-800')
              }
              onClick={() => setGroupName(null)}
            >
              No group (uncategorized)
            </button>
          </Field>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Yearly"
              hint="Budgeted as one annual lump; excluded from monthly run-rate."
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isYearly}
                  onClick={() => setIsYearly(!isYearly)}
                  className={
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                    (isYearly ? 'bg-navy-700' : 'bg-gray-300')
                  }
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: isYearly ? 22 : 2 }}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  {isYearly ? 'Yes — annual' : 'No — monthly'}
                </span>
              </div>
            </Field>
            <Field
              label="Quick assign"
              hint="Shows this category as a chip in Make rule for one-tap assignment."
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={quickAssign}
                  onClick={() => setQuickAssign(!quickAssign)}
                  className={
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
                    (quickAssign ? 'bg-navy-700' : 'bg-gray-300')
                  }
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: quickAssign ? 22 : 2 }}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  {quickAssign ? 'On — chip in Make rule' : 'Off'}
                </span>
              </div>
            </Field>
          </div>

          <Field label="Color" hint="Auto-assigned from name unless you pick a palette color.">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-navy-100"
                style={{ backgroundColor: swatch }}
              />
              <span className="text-caption text-gray-600">Override:</span>
              {CATEGORY_COLOR_PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="h-6 w-6 rounded-full border border-navy-100 focus:outline-none focus:ring-2 focus:ring-navy-400"
                  style={{ backgroundColor: hex }}
                  title={hex}
                  onClick={() => setColorOverride(hex)}
                />
              ))}
              {colorOverride && (
                <button
                  type="button"
                  className="text-caption font-semibold text-navy-700 underline"
                  onClick={() => setColorOverride(null)}
                >
                  reset
                </button>
              )}
            </div>
          </Field>

          {editing && (
            <div className="mt-6 rounded-lg border border-navy-100 bg-navy-50/40 p-4">
              <div className="text-caption text-gray-600">
                Renaming preserves all transaction links and rule references.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-navy-100 bg-gray-50 px-5 py-3">
          <div>
            {editing && (
              <button
                type="button"
                className="text-sm font-semibold text-neg hover:underline"
                onClick={handleDelete}
              >
                Delete category…
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!canSave} onClick={handleSave}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
