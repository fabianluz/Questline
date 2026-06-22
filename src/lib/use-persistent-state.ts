"use client";

import { useEffect, useState } from "react";

/**
 * Like `useState`, but the value is mirrored to `localStorage` under `key` and
 * restored on the next mount. Hydration happens in an effect (not the initial
 * render) so server and first client render stay identical — no hydration
 * mismatch. Safe when `localStorage` is unavailable (SSR / privacy mode).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed / unavailable storage */
    }
    // Only re-hydrate if the key itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [key, state]);

  return [state, setState];
}
