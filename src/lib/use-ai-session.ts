"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Local-storage backed draft persistence for the /ai pipeline.
 *
 * One row per browser. Survives reloads + tab navigation. Doesn't sync
 * between browsers — that's fine for a single-user local app. The
 * `docs/planning/local-ai-notes-pipeline.md` upgrade path swaps this to
 * a server-side `ai_session` table if cross-device draft sync is ever
 * needed.
 *
 * Fields:
 *   rawNotes   : the original text the user pasted (immutable per session
 *                once written — re-running stages doesn't re-collect it)
 *   structured : LLM run #1 output, editable
 *   json       : LLM run #2 output, editable
 *   status     : "notes" | "restructured" | "serialized" | "committed"
 */

export type AiSessionStatus =
  | "notes"
  | "restructured"
  | "serialized"
  | "committed";

export type AiSession = {
  rawNotes: string;
  structured: string;
  json: string;
  status: AiSessionStatus;
  updatedAt: string;
};

const STORAGE_KEY = "questline:ai:session.v1";

const EMPTY: AiSession = {
  rawNotes: "",
  structured: "",
  json: "",
  status: "notes",
  updatedAt: new Date().toISOString(),
};

function read(): AiSession {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AiSession>;
    return {
      rawNotes: parsed.rawNotes ?? "",
      structured: parsed.structured ?? "",
      json: parsed.json ?? "",
      status: (parsed.status as AiSessionStatus) ?? "notes",
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return EMPTY;
  }
}

function write(s: AiSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota or private mode — best effort.
  }
}

export function useAiSession() {
  // Hydration-safe: server renders the EMPTY state; client hydrates the
  // real value post-mount to avoid SSR/CSR HTML mismatch warnings.
  const [session, setSession] = useState<AiSession>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(read());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<AiSession>) => {
    setSession((prev) => {
      const next: AiSession = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      write(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSession(EMPTY);
  }, []);

  return { session, update, reset, hydrated };
}
