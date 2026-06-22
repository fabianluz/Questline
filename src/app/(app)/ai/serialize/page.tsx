"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { AiStepper } from "@/components/ai/ai-stepper";
import { ProfileFinalView } from "@/components/ai/profile-final-view";
import type { AiStreamEvent } from "@/lib/advisor";
import { extractJson } from "@/lib/extract-json";
import {
  ProfileJson,
  summarizeImport,
  type PreviewRow,
} from "@/lib/json-shapes";
import { useAiSession } from "@/lib/use-ai-session";

/**
 * /ai/serialize — Step 3: structured markdown → ProfileJson.
 *
 * Two-pane layout:
 *   Left  : the structured markdown from /ai/restructure, read-only.
 *   Right : streamed JSON output, editable. Live Zod validation tells
 *           the user immediately whether the JSON is import-ready.
 *
 * The summary preview ({categories: N, epics: N, ...}) is computed from
 * the validated payload — same `summarizeImport()` helper the import
 * dialog uses, so the rows look identical to the user when they reach
 * /ai/commit.
 */
export default function AiSerializePage() {
  const router = useRouter();
  const { session, update, hydrated } = useAiSession();

  const [json, setJson] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    responseTokens: number;
    durationMs: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    setJson(session.json);
    seededRef.current = true;
  }, [hydrated, session.json]);

  useEffect(() => {
    if (hydrated && !session.structured.trim()) {
      router.replace("/ai/restructure");
    }
  }, [hydrated, session.structured, router]);

  // Live validation: parse + Zod-check the JSON every time it changes.
  // Cheap (the schema is bounded) and lets us render inline error / OK
  // status immediately, before the user moves on.
  //
  // On failure, we ALSO expose the issues array verbatim so the "Fix with
  // AI" round-trip can feed precise path → reason pairs to the LLM.
  const validation = useMemo<
    | {
        ok: true;
        data: ProfileJson;
        rows: PreviewRow[];
      }
    | {
        ok: false;
        error: string;
        issueLines: string;
      }
    | { ok: "empty" }
  >(() => {
    if (!json.trim()) return { ok: "empty" };
    let parsed: unknown;
    try {
      // Robustly pull the JSON object out even if the model wrapped it in
      // ```json fences or added a preamble / trailing commentary.
      parsed = JSON.parse(extractJson(json));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Invalid JSON: ${msg}`,
        issueLines: `(root) → JSON parse failed: ${msg}`,
      };
    }
    const result = ProfileJson.safeParse(parsed);
    if (!result.success) {
      const issueLines = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} → ${i.message}`)
        .join("\n");
      return {
        ok: false,
        error: issueLines.split("\n").slice(0, 3).join("; "),
        issueLines,
      };
    }
    return {
      ok: true,
      data: result.data,
      // Uncapped preview — every Category / Skill / Epic etc. that
      // will be added shows up explicitly. This is the section the user
      // asked for as a "full enumeration".
      rows: summarizeImport("profile", result.data, {
        maxItems: Infinity,
      }),
    };
  }, [json]);

  /**
   * "Fix with AI": when validation fails, send the bad JSON + the Zod
   * issues to /api/ai/fix and stream a corrected output back into the
   * editor. The LLM gets the canonical EXAMPLE_PROFILE as a structural
   * template + the actual error paths, so the typical fix is surgical.
   */
  async function fixWithAi() {
    if (validation.ok !== false) return;
    setError(null);
    setStats(null);
    setStreaming(true);
    const previousJson = json;
    setJson(""); // clear so the streamed corrected output displays cleanly
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/ai/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badJson: previousJson,
          errors: validation.issueLines,
        }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        setError(`Server responded ${res.status}`);
        setJson(previousJson); // restore so user doesn't lose their work
        setStreaming(false);
        return;
      }
      await consumeSse(res.body, (event) => {
        if (event.type === "token") {
          setJson((s) => s + event.text);
        } else if (event.type === "done") {
          setStats({
            responseTokens: event.responseTokens,
            durationMs: event.durationMs,
          });
        } else if (event.type === "error") {
          setError(event.message);
          setJson(previousJson);
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
        setJson(previousJson);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function generate() {
    if (!session.structured.trim()) return;
    setError(null);
    setStats(null);
    setJson("");
    setStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/ai/serialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structured: session.structured }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        setError(`Server responded ${res.status}`);
        setStreaming(false);
        return;
      }
      await consumeSse(res.body, (event) => {
        if (event.type === "token") {
          setJson((s) => s + event.text);
        } else if (event.type === "done") {
          setStats({
            responseTokens: event.responseTokens,
            durationMs: event.durationMs,
          });
        } else if (event.type === "error") {
          setError(event.message);
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function continueNext() {
    if (validation.ok !== true) return;
    // Persist the CLEANED JSON (fences/preamble stripped) so /ai/commit can
    // re-parse it directly without inheriting any wrapper text.
    update({ json: extractJson(json), status: "serialized" });
    router.push("/ai/commit");
  }

  return (
    <div className="space-y-5">
      <AiStepper current="serialize" />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT — structured markdown (read-only) */}
        <div className="rounded-lg border p-3">
          <h2 className="!m-0 !border-0 !p-0 mb-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
            Structured input
          </h2>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-trails-trim/30 bg-trails-bg-deep/60 p-3 font-mono text-[11px] leading-relaxed text-trails-fg-dim">
            {session.structured || "(empty — go back to Step 2)"}
          </pre>
        </div>

        {/* RIGHT — JSON output (editable) */}
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="!m-0 !border-0 !p-0 font-display text-[11px] uppercase tracking-widest text-trails-accent">
              ProfileJson output
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {streaming ? (
                <button
                  onClick={cancel}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] hover:text-trails-bad"
                >
                  <Square className="h-3 w-3" /> Stop
                </button>
              ) : (
                <button
                  onClick={generate}
                  disabled={!session.structured.trim()}
                  className="inline-flex items-center gap-1 rounded-md border border-trails-accent bg-trails-accent/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/25 disabled:opacity-50"
                >
                  {json ? (
                    <RotateCcw className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {json ? "Re-run" : "Generate"}
                </button>
              )}
            </div>
          </div>

          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={22}
            placeholder={
              streaming
                ? "Streaming…"
                : 'Click Generate to convert. The output must be valid JSON matching ProfileJson (categories, skills, epics, …). Edit freely.'
            }
            className="w-full resize-y rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed"
          />

          {streaming && (
            <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-trails-fg-dim">
              <Loader2 className="h-3 w-3 animate-spin" />
              streaming · {json.length.toLocaleString()} chars
            </p>
          )}
          {stats && !streaming && (
            <p className="mt-2 font-mono text-[10px] text-trails-fg-dim">
              done · {stats.responseTokens} response tokens ·{" "}
              {(stats.durationMs / 1000).toFixed(1)} s
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Live validation status */}
      <section className="rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
            Validation
          </h2>
          {validation.ok === false && !streaming && (
            <button
              onClick={fixWithAi}
              title="Send the bad JSON + the validation errors back to the local LLM with the canonical example as a template. The LLM should make surgical fixes that preserve your data."
              className="inline-flex items-center gap-1 rounded-md border border-trails-warn bg-trails-warn/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-warn hover:bg-trails-warn/25"
            >
              <Wand2 className="h-3 w-3" />
              Fix with AI
            </button>
          )}
        </div>
        {validation.ok === "empty" && (
          <p className="text-xs text-trails-fg-dim">
            Generate or paste JSON above to see validation status here.
          </p>
        )}
        {validation.ok === false && (
          <div className="space-y-2 rounded-md border border-trails-bad/40 bg-trails-bad/10 p-2 text-xs text-trails-bad">
            <p className="inline-flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Validation failed — see issues below.</span>
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-trails-bad/30 bg-trails-bg-deep/40 p-2 font-mono text-[10px] text-trails-bad">
              {validation.issueLines}
            </pre>
            <p className="text-[10px] italic text-trails-fg-dim">
              Click <strong>Fix with AI</strong> above to send these errors
              back to Ollama with the canonical example as a template — it
              usually makes the corrections in one round-trip.
            </p>
          </div>
        )}
        {validation.ok === true && (
          <>
            <p className="inline-flex items-center gap-1 font-display text-[11px] uppercase tracking-widest text-trails-good">
              <Check className="h-3.5 w-3.5" />
              Valid ProfileJson — full enumeration + final view below
            </p>

            {/* 1) Full enumeration via summarizeImport (uncapped). */}
            <ul className="mt-2 divide-y divide-trails-trim/20 rounded-md border border-trails-trim/30 bg-trails-bg-deep/40 p-2 text-xs">
              {validation.rows.map((row, i) => (
                <li key={i} className="py-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
                      {row.label}
                    </span>
                    {row.value !== undefined && (
                      <span className="font-mono text-[11px] text-trails-fg">
                        {row.value}
                      </span>
                    )}
                  </div>
                  {row.items && row.items.length > 0 && (
                    <ul className="mt-1 ml-3 list-disc space-y-0.5 text-[10px] text-trails-fg-dim">
                      {row.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {/* 2) Final view — hierarchical render of every entity. */}
            <div className="mt-4 rounded-md border border-trails-accent/40 bg-trails-bg-glow/20 p-3">
              <ProfileFinalView profile={validation.data} />
            </div>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => router.push("/ai/restructure")}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <button
          onClick={continueNext}
          disabled={validation.ok !== true || streaming}
          title={
            validation.ok === true
              ? "Save the validated JSON and continue to commit"
              : "Resolve validation errors first"
          }
          className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AiStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(5).trim()) as AiStreamEvent;
        onEvent(payload);
      } catch {
        // ignore
      }
    }
  }
}
