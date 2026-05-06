/**
 * useReforecastDraftStatus — reports whether ANY Reforecast draft has
 * unsaved edits in localStorage.
 *
 * The Reforecast page persists in-progress edits under keys shaped like
 * `tf:reforecast-draft:<household>:<year>:<as_of_month>`. The sidebar uses
 * this hook to show an indicator next to the Reforecast nav link.
 *
 * Reactivity: localStorage changes raised in OTHER tabs fire the `storage`
 * window event automatically. Same-tab changes do NOT, so the Reforecast
 * page dispatches a custom `tf:reforecast-draft-change` event after every
 * mutation. The hook listens to both.
 */

import { useEffect, useState } from 'react';

export const REFORECAST_DRAFT_PREFIX = 'tf:reforecast-draft:';
export const REFORECAST_DRAFT_EVENT = 'tf:reforecast-draft-change';

/** Read the current "any draft exists?" status from localStorage. */
function readHasDrafts(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(REFORECAST_DRAFT_PREFIX)) return true;
    }
  } catch {
    /* localStorage unavailable */
  }
  return false;
}

/** Notify any in-tab listeners that a draft key was added/removed/changed. */
export function notifyReforecastDraftChange(): void {
  try {
    window.dispatchEvent(new Event(REFORECAST_DRAFT_EVENT));
  } catch {
    /* SSR or non-DOM environment — nothing to do */
  }
}

export function useReforecastDraftStatus(): { hasDrafts: boolean } {
  const [hasDrafts, setHasDrafts] = useState<boolean>(() => readHasDrafts());

  useEffect(() => {
    const recompute = () => setHasDrafts(readHasDrafts());

    // Cross-tab updates.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(REFORECAST_DRAFT_PREFIX)) {
        recompute();
      }
    };
    // Same-tab updates (dispatched manually from usePersistentMap).
    window.addEventListener('storage', onStorage);
    window.addEventListener(REFORECAST_DRAFT_EVENT, recompute);
    // Recompute once on mount in case localStorage was modified before the
    // hook ran (e.g. on a fresh page load).
    recompute();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(REFORECAST_DRAFT_EVENT, recompute);
    };
  }, []);

  return { hasDrafts };
}
