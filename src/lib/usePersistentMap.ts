/**
 * usePersistentMap — a Map<string, number> backed by localStorage.
 *
 * Used by the Reforecast page so a user's in-progress edits survive
 * navigating away from the page and back. The "snapshot" model means edits
 * aren't committed to the DB until the user clicks Save; without persistence
 * this means closing the tab loses work.
 *
 * Behavior:
 *   - Hydrates from localStorage on mount (and when the storage key changes).
 *   - Writes to localStorage on every change.
 *   - `key` is `null` while we don't yet have a stable scope (e.g. household
 *     loading); the hook is inert until a real key arrives, then hydrates.
 *   - `clear()` removes both the in-memory state AND the localStorage entry —
 *     used after a successful Save.
 *
 * Storage shape: JSON.stringify of the entries array, e.g.
 * `[["catA|7",250],["catA|8",300]]`. Tiny payloads (one snapshot's overrides
 * are at most a few dozen entries).
 */

import { useEffect, useRef, useState } from 'react';

export interface PersistentMapResult {
  map: Map<string, number>;
  set: (k: string, v: number) => void;
  /** Replace the whole map (used for "reset" flows). */
  replace: (m: Map<string, number>) => void;
  /** Drop all entries AND remove the localStorage record. */
  clear: () => void;
  /** True if the map currently has any entries (handy for "unsaved" badges). */
  isDirty: boolean;
}

export interface PersistentMapOptions {
  /**
   * Called every time the persisted state changes (after the localStorage
   * write). Lets external observers in the same tab react — `storage` events
   * only fire across tabs, so without this callback another component in the
   * same tab can't tell when a write happened. The Reforecast page uses this
   * to update the sidebar's "unsaved changes" indicator.
   */
  onChange?: () => void;
}

export function usePersistentMap(
  key: string | null,
  options: PersistentMapOptions = {},
): PersistentMapResult {
  const [map, setMap] = useState<Map<string, number>>(new Map());
  const onChangeRef = useRef(options.onChange);
  // Keep the ref pointed at the latest callback without re-running the
  // write-through effect on every render.
  onChangeRef.current = options.onChange;

  /**
   * Track which key we last hydrated for so we don't re-read on every render.
   * Storing in a ref (not state) avoids an extra render after hydration.
   */
  const hydratedKeyRef = useRef<string | null>(null);

  // Hydrate on mount AND whenever the key changes (e.g. switching years).
  useEffect(() => {
    if (key === null) {
      setMap(new Map());
      hydratedKeyRef.current = null;
      return;
    }
    if (hydratedKeyRef.current === key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<[string, number]>;
        if (Array.isArray(parsed)) {
          setMap(new Map(parsed));
          hydratedKeyRef.current = key;
          return;
        }
      }
    } catch {
      // Corrupt entry — wipe it; we'll just start fresh.
      try {
        localStorage.removeItem(key);
      } catch {
        /* localStorage unavailable; nothing to do */
      }
    }
    setMap(new Map());
    hydratedKeyRef.current = key;
  }, [key]);

  // Write-through on every change. Writes are skipped while key is null
  // (no scope yet) and while we haven't yet hydrated for this key (so we
  // don't immediately overwrite the stored value with an empty map during
  // the initial mount before hydration runs).
  useEffect(() => {
    if (key === null) return;
    if (hydratedKeyRef.current !== key) return;
    try {
      if (map.size === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
      }
    } catch {
      /* localStorage full or disabled — silently drop persistence */
    }
    onChangeRef.current?.();
  }, [key, map]);

  const set = (k: string, v: number) => {
    setMap((prev) => {
      const next = new Map(prev);
      next.set(k, v);
      return next;
    });
  };

  const replace = (m: Map<string, number>) => setMap(new Map(m));

  const clear = () => {
    setMap(new Map());
    if (key !== null) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* localStorage unavailable */
      }
    }
    onChangeRef.current?.();
  };

  return { map, set, replace, clear, isDirty: map.size > 0 };
}
