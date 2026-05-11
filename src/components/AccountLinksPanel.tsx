/**
 * QuickLinksPanel — a slim vertical sidebar beside the Import page.
 * Shows standalone quick-link bookmarks (name + URL) so users can jump
 * to bank websites to download CSVs without leaving the import flow.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/api/household';
import {
  fetchQuickLinks,
  createQuickLink,
  updateQuickLink,
  deleteQuickLink,
  type QuickLink,
} from '@/api/quickLinks';

export function AccountLinksPanel() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const household = useHousehold();

  const linksQ = useQuery({
    queryKey: ['quick-links', household?.id],
    queryFn: () => fetchQuickLinks(household!.id),
    enabled: !!household?.id,
  });
  const links = linksQ.data ?? [];

  return (
    <aside className="quick-links-panel">
      <div className="quick-links-header">
        <ExternalLinkGlyph />
        <span>Quick Links</span>
      </div>
      <p className="quick-links-hint">
        Open your bank to download statements, then drop CSVs here.
      </p>

      <div className="quick-links-list">
        {linksQ.isLoading && (
          <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
        )}

        {links.map((link) =>
          editingId === link.id ? (
            <div key={link.id} className="px-3 py-1">
              <LinkEditor
                link={link}
                householdId={household!.id}
                onDone={() => setEditingId(null)}
              />
            </div>
          ) : (
            <QuickLinkRow
              key={link.id}
              link={link}
              onEdit={() => setEditingId(link.id)}
            />
          ),
        )}

        {links.length === 0 && !linksQ.isLoading && (
          <div className="px-3 py-2 text-xs text-gray-400" style={{ lineHeight: 1.45 }}>
            No links yet — use the button below to add a bank URL.
          </div>
        )}
      </div>

      {adding ? (
        <div className="px-3 py-2">
          <LinkEditor
            householdId={household!.id}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="quick-links-add-wrap">
          <button
            type="button"
            className="quick-links-add-btn"
            onClick={() => setAdding(true)}
            title="Add link"
            aria-label="Add link"
          >
            <PlusIcon />
            <span>Add link…</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function QuickLinkRow({
  link,
  onEdit,
}: {
  link: QuickLink;
  onEdit: () => void;
}) {
  return (
    <div className="quick-link-row">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${link.name}`}
        className="quick-link-anchor"
      >
        <BankIcon />
        <span className="quick-link-label">{link.name}</span>
        <ArrowOutIcon />
      </a>
      <button
        type="button"
        className="quick-link-edit-btn"
        onClick={onEdit}
        title="Edit link"
        aria-label={`Edit link for ${link.name}`}
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function LinkEditor({
  link,
  householdId,
  onDone,
}: {
  link?: QuickLink;
  householdId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(link?.name ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const nameRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (link) {
        await updateQuickLink(link.id, { name, url });
      } else {
        await createQuickLink({ household_id: householdId, name, url });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-links'] });
      onDone();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuickLink(link!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-links'] });
      onDone();
    },
  });

  const isPending = saveMutation.isPending || deleteMutation.isPending;
  const canSave = name.trim() && url.trim();

  function handleSave() {
    if (!canSave) return;
    saveMutation.mutate();
  }

  return (
    <div className="link-editor">
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="Link name"
        className="link-editor-input"
        style={{ marginBottom: 4 }}
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="https://bank.com/login"
        className="link-editor-input"
      />
      <div className="link-editor-actions">
        <button
          type="button"
          className="link-editor-save"
          onClick={handleSave}
          disabled={isPending || !canSave}
        >
          {isPending ? '…' : 'Save'}
        </button>
        {link && (
          <button
            type="button"
            className="link-editor-remove"
            onClick={() => deleteMutation.mutate()}
            disabled={isPending}
          >
            Delete
          </button>
        )}
        <button type="button" className="link-editor-cancel" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Inline SVG icons ─────────────────────────────────── */

function ExternalLinkGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M13.5 10v3.5a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 13.5V6a1.5 1.5 0 011.5-1.5H8"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M11 3h4v4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 10.5L15 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 18 18" fill="none" aria-hidden className="quick-link-bank-icon">
      <path d="M9 2L2.5 6h13L9 2z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M4 6v6M7 6v6M11 6v6M14 6v6" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <path d="M2.5 12h13v2h-13v-2z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}

function ArrowOutIcon() {
  return (
    <svg width={10} height={10} viewBox="0 0 12 12" fill="none" aria-hidden className="quick-link-arrow">
      <path d="M3.5 8.5L8.5 3.5M8.5 3.5H4.5M8.5 3.5V7.5" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"
        stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth={1.3} />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}
