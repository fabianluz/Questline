"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { AiStepper } from "@/components/ai/ai-stepper";
import { ProfileFinalView } from "@/components/ai/profile-final-view";
import { trpc } from "@/lib/trpc";
import {
  ProfileJson,
  summarizeImport,
  type PreviewRow,
} from "@/lib/json-shapes";
import { extractJson } from "@/lib/extract-json";
import { useAiSession } from "@/lib/use-ai-session";

/**
 * /ai/commit — Step 4: import the validated JSON via dataio.importProfile.
 *
 * Re-runs validation (defense in depth) and renders the same preview rows
 * the import dialog shows on /profile. The user picks merge vs replace,
 * confirms, and on success we redirect to /dashboard + clear the session
 * so the next visit to /ai/notes starts fresh.
 */
export default function AiCommitPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { session, reset, hydrated } = useAiSession();

  const [replaceMode, setReplaceMode] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  const importProfile = trpc.dataio.importProfile.useMutation({
    onSuccess: () => {
      // After import every cached query is stale.
      utils.invalidate();
    },
  });

  useEffect(() => {
    if (hydrated && !session.json.trim()) {
      router.replace("/ai/serialize");
    }
  }, [hydrated, session.json, router]);

  // Re-validate so a stale localStorage payload can't slip past us if
  // the schema changed between steps. Cheap.
  const validation = useMemo<
    | { ok: true; data: ProfileJson; rows: PreviewRow[] }
    | { ok: false; error: string }
    | { ok: "empty" }
  >(() => {
    if (!session.json.trim()) return { ok: "empty" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(session.json));
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON: ${err instanceof Error ? err.message : err}`,
      };
    }
    const result = ProfileJson.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"} → ${i.message}`)
          .join("; "),
      };
    }
    return {
      ok: true,
      data: result.data,
      // Uncapped — every category / skill / epic / etc. listed.
      rows: summarizeImport("profile", result.data, { maxItems: Infinity }),
    };
  }, [session.json]);

  async function commit() {
    if (validation.ok !== true) return;
    setSubmitError(null);
    setCounts(null);
    try {
      const result = await importProfile.mutateAsync({
        profile: validation.data,
        mode: replaceMode ? "replace" : "merge",
      });
      setCounts(result);
      // Mark session done + wipe the draft so the next /ai/notes visit
      // is a clean slate.
      reset();
      // Short delay so the user sees the "imported" confirmation row.
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-5">
      <AiStepper current="commit" />

      <section className="rounded-lg border p-4">
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
          Step 4 · Review &amp; commit
        </h2>
        <p className="mt-1 text-xs text-trails-fg-dim">
          Final check. This is the same preview the manual JSON Import
          dialog renders, so the experience matches the rest of the app.
        </p>

        {validation.ok === "empty" && (
          <p className="mt-3 text-xs text-trails-fg-dim">
            No JSON yet — go back to Step 3.
          </p>
        )}

        {validation.ok === false && (
          <p className="mt-3 inline-flex items-start gap-2 text-xs text-trails-bad">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {validation.error}
          </p>
        )}

        {validation.ok === true && (
          <>
            {/* 1) Full enumeration — every entity, no cap. */}
            <ul className="mt-3 divide-y divide-trails-trim/20 rounded-md border border-trails-trim/30 bg-trails-bg-deep/40 p-3 text-sm">
              {validation.rows.map((row, i) => (
                <li key={i} className="py-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[11px] uppercase tracking-widest text-trails-accent">
                      {row.label}
                    </span>
                    {row.value !== undefined && (
                      <span className="font-mono text-xs text-trails-fg">
                        {row.value}
                      </span>
                    )}
                  </div>
                  {row.items && row.items.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-trails-fg-dim">
                      {row.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {/* 2) Final view — what the app will actually look like. */}
            <div className="mt-4 rounded-md border border-trails-accent/40 bg-trails-bg-glow/20 p-3">
              <ProfileFinalView profile={validation.data} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-trails-trim/30 pt-3">
              <label
                title="When ON, the importer wipes your current data first. When OFF, it ADDS — existing categories / skills / epics / etc. are preserved."
                className="inline-flex items-center gap-1.5 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim"
              >
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                />
                Replace existing data on commit
              </label>
              <button
                onClick={commit}
                disabled={importProfile.isPending || !!counts}
                title="Run dataio.importProfile with the validated payload"
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {importProfile.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : counts ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {importProfile.isPending
                  ? "Committing…"
                  : counts
                    ? "Imported"
                    : replaceMode
                      ? "Confirm import (REPLACE)"
                      : "Confirm import (merge)"}
              </button>
            </div>

            {submitError && (
              <p className="mt-3 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
                {submitError}
              </p>
            )}
            {counts && (
              <p className="mt-3 rounded-md border border-trails-good/60 bg-trails-good/10 p-2 text-xs text-trails-good">
                Imported{" "}
                {Object.entries(counts)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(" · ")}
                . Redirecting to dashboard…
              </p>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => router.push("/ai/serialize")}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
      </div>
    </div>
  );
}
