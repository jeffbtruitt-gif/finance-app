/**
 * AccountLinksPanel — a slim vertical sidebar that sits beside the Import
 * page content. Shows quick-link buttons for each bank account that has a
 * URL configured, plus an inline editor to add/change/remove URLs.
 *
 * Designed to be placed as a flex sibling of the main page content so
 * users can jump to their bank website to download CSVs without leaving
 * the import flow.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAccounts, updateAccountLink, type AccountOption } from '@/api/transactions';

export function AccountLinksPanel() {
  const [editingId, setEditingId] = useState<string | null>(null);

  const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const accounts = accountsQ.data ?? [];

  const linked = accounts.filter((a) => a.link);
  const unlinked = accounts.filter((a) => !a.link);

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
        {accountsQ.isLoading && (
          <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
        )}

        {linked.map((acct) => (
          <AccountLinkRow
            key={acct.id}
            account={acct}
            isEditing={editingId === acct.id}
            onEdit={() => setEditingId(editingId === acct.id ? null : acct.id)}
            onDone={() => setEditingId(null)}
          />
        ))}

        {linked.length === 0 && !accountsQ.isLoading && (
          <div className="px-3 py-2 text-xs text-gray-400" style={{ lineHeight: 1.45 }}>
            No links yet — use the button below to add a bank URL.
          </div>
        )}
      </div>

      {unlinked.length > 0 && (
        <AddLinkSection
          accounts={unlinked}
          editingId={editingId}
          onStartEdit={(id) => setEditingId(id)}
          onDone={() => setEditingId(null)}
        />
      )}
    </aside>
  );
}

function AccountLinkRow({
  account,
  isEditing,
  onEdit,
  onDone,
}: {
  account: AccountOption;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  if (isEditing) {
    return (
      <div className="px-3 py-1">
        <LinkEditor account={account} onDone={onDone} />
      </div>
    );
  }

  return (
    <div className="quick-link-row">
      <a
        href={account.link!}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${account.name}`}
        className="quick-link-anchor"
      >
        <BankIcon />
        <span className="quick-link-label">{account.name}</span>
        <ArrowOutIcon />
      </a>
      <button
        type="button"
        className="quick-link-edit-btn"
        onClick={onEdit}
        title="Edit link"
        aria-label={`Edit link for ${account.name}`}
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function AddLinkSection({
  accounts,
  editingId,
  onStartEdit,
  onDone,
}: {
  accounts: AccountOption[];
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const editingAccount = accounts.find((a) => a.id === editingId);
  if (editingAccount) {
    return (
      <div className="px-3 py-2">
        <LinkEditor account={editingAccount} onDone={onDone} />
      </div>
    );
  }

  return (
    <div ref={dropRef} className="quick-links-add-wrap">
      <button
        type="button"
        className="quick-links-add-btn"
        onClick={() => setOpen(!open)}
        title="Add account link"
        aria-label="Add account link"
      >
        <PlusIcon />
        <span>Add link…</span>
      </button>

      {open && (
        <div className="quick-links-dropdown">
          <div className="quick-links-dropdown-title">Choose Account</div>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className="quick-links-dropdown-item"
              onClick={() => {
                setOpen(false);
                onStartEdit(a.id);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkEditor({
  account,
  onDone,
}: {
  account: AccountOption;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(account.link ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const mutation = useMutation({
    mutationFn: (newLink: string | null) => updateAccountLink(account.id, newLink),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onDone();
    },
  });

  function handleSave() {
    const trimmed = url.trim();
    let normalized = trimmed || null;
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    mutation.mutate(normalized);
  }

  function handleRemove() {
    mutation.mutate(null);
  }

  return (
    <div className="link-editor">
      <div className="link-editor-name">{account.name}</div>
      <input
        ref={inputRef}
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
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '…' : 'Save'}
        </button>
        {account.link && (
          <button
            type="button"
            className="link-editor-remove"
            onClick={handleRemove}
            disabled={mutation.isPending}
          >
            Remove
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
