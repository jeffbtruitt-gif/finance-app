import { Card } from '@/components/ds';

const COL = {
  drag: 14,
  check: 16,
  group: 160,
  actions: 200,
} as const;

export function ListHeaderRow() {
  return (
    <Card padded={false} className="sticky top-0 z-10 mb-2 overflow-hidden">
      <div
        className="flex items-center border-b border-navy-200 bg-navy-50 px-4 py-2 text-label uppercase text-gray-600"
        style={{ gap: 8 }}
      >
        <div style={{ width: COL.drag, flexShrink: 0 }} aria-hidden />
        <div style={{ width: COL.check, flexShrink: 0 }} aria-hidden />
        <div className="min-w-0 flex-1">Category</div>
        <div style={{ width: COL.group, flexShrink: 0 }}>Group</div>
        <div
          className="flex shrink-0 justify-end"
          style={{ width: COL.actions }}
        >
          Actions
        </div>
      </div>
    </Card>
  );
}

export const CATEGORY_COL_WIDTHS = COL;
