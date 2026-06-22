"use client";

import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

const KEY = "questline.lastAutoBackup";
const INTERVAL_MS = 20 * 60 * 60 * 1000; // ~once per day

/**
 * Fires a local profile snapshot (dataio.backupNow → ~/Questline Backups) at
 * most once per ~20h, tracked in localStorage. Mounted once in the app layout.
 * Silent on success/failure — it's a safety net, not a user action.
 */
export function useAutoBackup(enabled: boolean) {
  const backup = trpc.dataio.backupNow.useMutation();
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled || fired.current) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {
      /* storage unavailable */
    }
    if (Date.now() - last < INTERVAL_MS) return;

    fired.current = true;
    backup.mutate(undefined, {
      onSuccess: () => {
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      },
      onError: () => {
        // Allow a retry on the next mount if it failed (e.g. disk busy).
        fired.current = false;
      },
    });
  }, [enabled, backup]);
}
