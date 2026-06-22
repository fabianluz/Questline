"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { AiStepper } from "@/components/ai/ai-stepper";
import type { AiStreamEvent } from "@/lib/advisor";
import { useAiSession } from "@/lib/use-ai-session";

/**
 * /ai/restructure — Step 2: raw notes → structured Questline markdown.
 *
 * Two-pane layout:
 *   Left  : the raw notes from /ai/notes, read-only.
 *   Right : the structured output. Stream-appended while the LLM runs,
 *           then fully editable so the user can fix anything.
 *
 * SSE consumption mirrors AIGuideModal — POST a JSON body, parse each
 * `data: {…}\n\n` chunk, append `token` events to the editable text.
 */
export default function AiRestructurePage() {
  const router = useRouter();
  const { session, update, hydrated } = useAiSession();

  const [structured, setStructured] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    promptTokens: number;
    responseTokens: number;
    durationMs: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const seededRef = useRef(false);

  // Seed the editor from session.structured once we've hydrated.
  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    setStructured(session.structured);
    seededRef.current = true;
  }, [hydrated, session.structured]);

  // If hydrated and there are no rawNotes yet, send the user back to /ai/notes.
  useEffect(() => {
    if (hydrated && !session.rawNotes.trim()) {
      router.replace("/ai/notes");
    }
  }, [hydrated, session.rawNotes, router]);

  async function generate() {
    if (!session.rawNotes.trim()) return;
    setError(null);
    setStats(null);
    setStructured(""); // fresh run
    setStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/ai/restructure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNotes: session.rawNotes }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        setError(`Server responded ${res.status}`);
        setStreaming(false);
        return;
      }
      await consumeSse(res.body, (event) => {
        if (event.type === "token") {
          setStructured((s) => s + event.text);
        } else if (event.type === "done") {
          setStats({
            promptTokens: event.promptTokens,
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
    if (!structured.trim()) return;
    update({ structured, status: "restructured" });
    router.push("/ai/serialize");
  }

  return (
    <div className="space-y-5">
      <AiStepper current="restructure" />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT — raw notes (read-only) */}
        <div className="rounded-lg border p-3">
          <h2 className="!m-0 !border-0 !p-0 mb-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
            Your raw notes
          </h2>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-trails-trim/30 bg-trails-bg-deep/60 p-3 font-mono text-[11px] leading-relaxed text-trails-fg-dim">
            {session.rawNotes || "(no notes — go back to Step 1)"}
          </pre>
        </div>

        {/* RIGHT — structured output (editable) */}
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="!m-0 !border-0 !p-0 font-display text-[11px] uppercase tracking-widest text-trails-accent">
              Structured output
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {streaming ? (
                <button
                  onClick={cancel}
                  title="Stop the current LLM run"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] hover:text-trails-bad"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={generate}
                  disabled={!session.rawNotes.trim()}
                  title={
                    structured
                      ? "Re-run — discards the current output and regenerates"
                      : "Run the local LLM on your raw notes"
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-trails-accent bg-trails-accent/15 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/25 disabled:opacity-50"
                >
                  {structured ? (
                    <RotateCcw className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {structured ? "Re-run" : "Generate"}
                </button>
              )}
            </div>
          </div>

          <textarea
            value={structured}
            onChange={(e) => setStructured(e.target.value)}
            rows={22}
            placeholder={
              streaming
                ? "Streaming…"
                : "Click Generate to run the local LLM. Output will stream here. Edit freely after."
            }
            className="w-full resize-y rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed"
          />

          {streaming && (
            <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-trails-fg-dim">
              <Loader2 className="h-3 w-3 animate-spin" />
              streaming · {structured.length.toLocaleString()} chars
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => router.push("/ai/notes")}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <button
          onClick={continueNext}
          disabled={!structured.trim() || streaming}
          title={
            structured.trim()
              ? "Save the structured output and continue to JSON conversion"
              : "Generate or paste structured output first"
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

/**
 * Minimal SSE-line parser. Reads the Response.body stream, splits on
 * blank lines, and invokes the callback for each `data:`-prefixed frame.
 */
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
        // ignore malformed frame
      }
    }
  }
}
