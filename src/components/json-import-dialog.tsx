"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Check,
  Eye,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  buildLlmPrompt,
  SHAPES,
  summarizeImport,
  type PreviewRow,
  type ShapeKey,
} from "@/lib/json-shapes";
import { extractJson } from "@/lib/extract-json";

/**
 * Generic JSON paste-or-upload modal with **preview mode**.
 *
 * Flow:
 *   1. paste / upload → 2. validate against Zod → 3. preview summary →
 *   4. user confirms → 5. submit
 *
 * Validation is a fast local check; the preview never touches the server.
 * Only on confirm do we call `onSubmit`, which the caller wires to the
 * appropriate tRPC mutation.
 *
 * The dedicated CalendarImportPreviewModal still owns the per-VEVENT
 * checkbox flow for .ics — this dialog handles JSON shapes.
 */
export function JsonImportDialog<S extends ShapeKey>({
  open,
  onClose,
  shape: shapeKey,
  title,
  onSubmit,
  initialText,
  modeSelect,
}: {
  open: boolean;
  onClose: () => void;
  shape: S;
  title: string;
  onSubmit: (
    parsed: unknown,
    mode: "merge" | "replace",
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Pre-fill the textarea when the dialog opens — used by the Dashboard's
   * "View example JSON" button so the user can preview + commit a worked
   * example in two clicks.
   */
  initialText?: string;
  /**
   * When true, the preview step shows a Merge / Replace selector and passes
   * the choice to `onSubmit`. Use for shapes whose import supports replacing
   * the existing data (chapter board, full profile).
   */
  modeSelect?: boolean;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [mode, setMode] = useState<"merge" | "replace">("merge");

  // When the dialog (re-)opens and a fresh initialText is supplied, seed
  // the textarea with it. We avoid clobbering user-edited text by only
  // syncing while the dialog transitions from closed → open.
  useEffect(() => {
    if (open && initialText !== undefined) {
      setText(initialText);
    }
  }, [open, initialText]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validated payload waiting for confirmation. When set, the dialog
  // renders the preview step.
  const [preview, setPreview] = useState<{
    data: unknown;
    rows: PreviewRow[];
  } | null>(null);

  const shape = SHAPES[shapeKey];

  function reset() {
    setText("");
    setError(null);
    setPreview(null);
    setSuccess(false);
    setMode("merge");
  }

  async function handleFile(file: File) {
    setText(await file.text());
    setError(null);
  }

  async function validateAndPreview() {
    setError(null);
    setSuccess(false);
    let parsed: unknown;
    try {
      // Tolerate ```json fences / preamble if pasted straight from an LLM.
      parsed = JSON.parse(extractJson(text));
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : err}`);
      return;
    }
    // Local Zod validation against the chosen shape.
    const schemas = await import("@/lib/json-shapes");
    const schema =
      shapeKey === "profile"
        ? schemas.ProfileJson
        : shapeKey === "epic"
          ? schemas.EpicJson
          : shapeKey === "milestone"
            ? schemas.MilestoneJson
            : shapeKey === "category"
              ? schemas.CategoryJson
              : shapeKey === "skill"
                ? schemas.SkillJson
                : shapeKey === "quest"
                  ? schemas.QuestJson
                  : shapeKey === "account"
                    ? schemas.AccountJson
                    : shapeKey === "bill"
                      ? schemas.BillJson
                      : shapeKey === "goal"
                        ? schemas.GoalJson
                        : shapeKey === "preferences"
                          ? schemas.PreferencesJson
                          : shapeKey === "chapterBoard"
                            ? schemas.ChapterBoardJson
                            : null;
    const result = schema?.safeParse(parsed);
    if (!result || !result.success) {
      const issues = result?.error?.issues
        .map((i) => `${i.path.join(".") || "(root)"} → ${i.message}`)
        .join("; ");
      setError(`Validation failed: ${issues ?? "unknown schema"}`);
      return;
    }
    setPreview({
      data: result.data,
      rows: summarizeImport(shapeKey, result.data),
    });
  }

  async function confirmImport() {
    if (!preview) return;
    setSubmitting(true);
    try {
      const res = await onSubmit(preview.data, mode);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          reset();
          onClose();
        }, 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(buildLlmPrompt(shape));
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => {
        reset();
        onClose();
      }}
    >
      <div
        className="jrpg-panel relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <div>
            <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
              📥 {preview ? "Preview · " : "Import · "}
              {title}
            </h2>
            <p className="mt-1 text-xs text-jrpg-muted">{shape.summary}</p>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            title="Close (no changes will be made)"
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ===== Step 1: paste / upload + validate ===== */}
        {!preview && (
          <>
            <div className="space-y-3 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="text-xs"
                />
                <button
                  onClick={copyPrompt}
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-jrpg-gold/40 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-jrpg-gold-bright hover:bg-jrpg-violet/30"
                  title="Copy a prompt you can paste into any LLM to generate this exact shape"
                >
                  <Sparkles className="h-3 w-3" /> Copy LLM prompt
                </button>
              </div>

              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="Paste JSON here, or upload a .json file above..."
                rows={14}
                className="w-full resize-y rounded-md border border-jrpg-gold/40 bg-black/40 p-3 font-mono text-xs text-jrpg-gold-bright"
              />

              {error && (
                <p className="rounded-md border border-jrpg-crimson/60 bg-jrpg-crimson/10 p-2 text-xs text-jrpg-crimson">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-4">
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="jrpg-btn jrpg-btn--ghost"
              >
                Close
              </button>
              <button
                onClick={validateAndPreview}
                disabled={!text.trim()}
                title="Validate the JSON and show a summary of what will be added — nothing is committed yet"
                className="jrpg-btn inline-flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>
          </>
        )}

        {/* ===== Step 2: preview summary + confirm ===== */}
        {preview && (
          <>
            <div className="space-y-3 overflow-y-auto p-4 text-sm">
              <p className="text-xs text-jrpg-muted">
                Your JSON is valid. Review what will be created below — nothing
                has been committed yet. Click <strong>Confirm import</strong>{" "}
                to commit, or <strong>Back</strong> to edit the JSON.
              </p>

              {modeSelect && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-jrpg-gold/40 bg-black/30 p-2 text-xs">
                  <span className="font-display uppercase tracking-widest text-jrpg-gold-bright">
                    On import
                  </span>
                  <label className="inline-flex items-center gap-1 text-trails-fg">
                    <input
                      type="radio"
                      checked={mode === "merge"}
                      onChange={() => setMode("merge")}
                    />
                    Merge (add to existing)
                  </label>
                  <label className="inline-flex items-center gap-1 text-trails-fg">
                    <input
                      type="radio"
                      checked={mode === "replace"}
                      onChange={() => setMode("replace")}
                    />
                    Replace (wipe + import)
                  </label>
                  {mode === "replace" && (
                    <span className="text-jrpg-crimson">
                      ⚠ deletes your current {title.toLowerCase()} first
                    </span>
                  )}
                </div>
              )}

              <ul className="divide-y divide-jrpg-gold/20 rounded-md border border-jrpg-gold/40 bg-black/30 p-3">
                {preview.rows.map((row, i) => (
                  <li key={i} className="py-1.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-[11px] uppercase tracking-widest text-jrpg-gold-bright">
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

              <details className="rounded-md border border-jrpg-gold/30">
                <summary className="cursor-pointer p-2 font-display text-[10px] uppercase tracking-widest text-jrpg-gold/80 hover:text-jrpg-gold-bright">
                  Show raw JSON
                </summary>
                <pre className="max-h-48 overflow-auto border-t border-jrpg-gold/30 bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-jrpg-gold-bright">
                  {JSON.stringify(preview.data, null, 2)}
                </pre>
              </details>

              {error && (
                <p className="rounded-md border border-jrpg-crimson/60 bg-jrpg-crimson/10 p-2 text-xs text-jrpg-crimson">
                  {error}
                </p>
              )}
              {success && (
                <p className="inline-flex items-center gap-1 font-display text-[11px] uppercase tracking-widest text-trails-good">
                  <Check className="h-3 w-3" /> Imported successfully.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-4">
              <button
                onClick={() => setPreview(null)}
                disabled={submitting || success}
                title="Go back to editing the JSON"
                className="jrpg-btn jrpg-btn--ghost inline-flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </button>
              <button
                onClick={confirmImport}
                disabled={submitting || success}
                title="Commit the preview to the database"
                className="jrpg-btn inline-flex items-center gap-1"
              >
                <Upload className="h-3 w-3" />
                {submitting ? "Importing..." : "Confirm import"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
