"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, FileText, RotateCcw, Upload } from "lucide-react";
import { AiStepper } from "@/components/ai/ai-stepper";
import { useAiSession } from "@/lib/use-ai-session";

/**
 * /ai/notes — Step 1: capture raw notes.
 *
 * Big textarea + optional file upload. When the user clicks Continue we
 * persist the text into the local AI session and advance to
 * /ai/restructure. We do NOT call any LLM here.
 */
export default function AiNotesPage() {
  const router = useRouter();
  const { session, update, reset, hydrated } = useAiSession();
  const [draft, setDraft] = useState<string>("");
  const [seeded, setSeeded] = useState(false);

  // Hydrate once with whatever's in the session row (could be empty).
  if (hydrated && !seeded) {
    setDraft(session.rawNotes);
    setSeeded(true);
  }

  async function onFile(file: File) {
    const text = await file.text();
    setDraft(text);
  }

  function continueNext() {
    if (!draft.trim()) return;
    update({ rawNotes: draft, status: "notes" });
    router.push("/ai/restructure");
  }

  return (
    <div className="space-y-5">
      <AiStepper current="notes" />

      <section className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
            <FileText className="h-4 w-4 text-trails-accent" />
            Step 1 · Paste or upload your raw notes
          </h2>
          {session.rawNotes && (
            <button
              onClick={() => {
                if (confirm("Discard the current AI session draft?")) {
                  reset();
                  setDraft("");
                }
              }}
              title="Wipe the current draft and start over"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim hover:text-trails-bad"
            >
              <RotateCcw className="h-3 w-3" />
              Start over
            </button>
          )}
        </div>

        <p className="mt-1 text-xs text-trails-fg-dim">
          Markdown, plain text, bullet lists — anything goes. The shape
          your notes are in doesn't matter; the next step's LLM run
          restructures them into Questline vocabulary for you.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:text-trails-accent">
            <Upload className="h-3 w-3" />
            Upload .md / .txt
            <input
              type="file"
              accept=".md,.txt,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          {draft && (
            <span className="font-mono text-[10px] text-trails-fg-dim">
              {draft.length.toLocaleString()} chars
            </span>
          )}
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          placeholder="- **Finish my exams (top priority)**…&#10;- **Move to the Netherlands**…&#10;- Fitness goals:&#10;  - …"
          className="mt-3 w-full resize-y rounded-md px-3 py-2 font-mono text-xs leading-relaxed"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/help/tutorial"
          className="inline-flex items-center gap-1 text-xs text-trails-fg-dim hover:text-trails-accent"
        >
          Need a vocabulary refresher? See the Tutorial
        </Link>
        <button
          onClick={continueNext}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Continue
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
