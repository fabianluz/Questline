"use client";

import { useState } from "react";
import { Check, ChevronLeft, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Chapter Board · AI Generate modal.
 *
 * Three states:
 *
 *   "intro"     — initial. Show what the AI will do + a "Generate" button.
 *                 On click: call board.aiPlan() with no answers.
 *
 *   "questions" — server returned `{kind:"questions"}`. Show a form, collect
 *                 answers, then call board.aiPlan({answers}) again.
 *
 *   "plan"      — server returned `{kind:"plan"}`. Show a hierarchical
 *                 preview of the chapters + cards. User picks merge/replace
 *                 + confirms → board.commitPlan.
 *
 * All AI calls happen locally via Ollama (the aiPlan procedure uses
 * lib/advisor.planChapterLayout). No remote calls.
 */
export function BoardAiPlanModal({
  open,
  onClose,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  onCommitted: () => void;
}) {
  type Question = {
    id: string;
    text: string;
    kind: "free" | "choice";
    choices?: string[];
  };
  type PlanNode = {
    kind: "epic" | "milestone" | "quest";
    refId: string;
    tier: number;
  };
  type PlanChapter = {
    title: string;
    color?: string;
    notes?: string;
    nodes: PlanNode[];
  };

  const [step, setStep] = useState<"intro" | "questions" | "plan">("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<PlanChapter[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // We resolve refIds to human titles so the preview is readable. The same
  // listBoard query the page uses doesn't carry every backlog title, so we
  // query the picker which lists every entity NOT yet on the board PLUS we
  // fall back to the placed nodes' titles from listBoard.
  const picker = trpc.board.pickerOptions.useQuery(undefined, {
    enabled: open && step === "plan",
  });
  const board = trpc.board.listBoard.useQuery(undefined, {
    enabled: open && step === "plan",
  });

  const aiPlanMut = trpc.board.aiPlan.useMutation();
  const commitMut = trpc.board.commitPlan.useMutation();

  function reset() {
    setStep("intro");
    setQuestions([]);
    setAnswers({});
    setPlan([]);
    setModel(null);
    setMode("merge");
    setError(null);
    setBusy(false);
    setSuccess(false);
  }

  async function runPlan(withAnswers?: Question[]) {
    setError(null);
    setBusy(true);
    try {
      const res = await aiPlanMut.mutateAsync(
        withAnswers
          ? {
              answers: withAnswers.map((q) => ({
                questionId: q.id,
                question: q.text,
                answer: answers[q.id] ?? "",
              })),
            }
          : undefined,
      );
      setModel(res.model);
      if (res.kind === "questions") {
        setQuestions(res.questions);
        setStep("questions");
      } else {
        setPlan(res.chapters);
        setStep("plan");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCommit() {
    setError(null);
    setBusy(true);
    try {
      const cleaned = plan.map((c) => ({
        title: c.title,
        color: c.color ?? null,
        notes: c.notes ?? null,
        nodes: c.nodes,
      }));
      await commitMut.mutateAsync({ mode, chapters: cleaned });
      setSuccess(true);
      setTimeout(() => {
        reset();
        onCommitted();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Build a refId → display map from both pickerOptions + the currently
  // placed nodes (covers entities that are already on the board too).
  const refTitle = new Map<string, string>();
  if (picker.data) {
    for (const e of picker.data.epics) refTitle.set(e.id, e.title);
    for (const m of picker.data.milestones) refTitle.set(m.id, m.title);
    for (const q of picker.data.quests) refTitle.set(q.id, q.title);
  }
  if (board.data) {
    for (const n of board.data.nodes) {
      if (!refTitle.has(n.refId)) refTitle.set(n.refId, n.title);
    }
  }

  if (!open) return null;

  const intro = (
    <div className="space-y-3 p-5 text-sm">
      <p className="text-trails-fg-dim">
        The local LLM will read your existing Epics, Milestones, and Quests,
        and propose <strong>2–4 chapters</strong> arranged in narrative order
        (Chapter 1 → first). Within each chapter, tier 0 happens first and
        same-tier cards happen in parallel.
      </p>
      <p className="text-trails-fg-dim">
        First it asks you <strong>at least 3 short questions</strong> about
        focus, pace, and deadlines — your answers shape how the chapters are
        sequenced. A big Epic can span several chapters: its milestones get
        distributed across them (e.g. "Learn Dutch A1" in Chapter 1, "A2" in
        Chapter 2).
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-trails-fg-dim">
        <li>Runs <strong>100% locally</strong> via Ollama.</li>
        <li>Retries automatically if a generation comes back empty.</li>
        <li>Nothing is committed until you confirm.</li>
        <li>You can pick <em>Merge</em> to append, or <em>Replace</em> to wipe + apply.</li>
      </ul>
    </div>
  );

  const questionsView = (
    <div className="space-y-4 overflow-y-auto p-5">
      <p className="text-xs text-trails-fg-dim">
        Answer the questions below — the local LLM will use them to plan
        your chapter board.
      </p>
      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="block font-display text-xs uppercase tracking-wider text-trails-accent">
            {q.text}
          </label>
          {q.kind === "choice" && q.choices && q.choices.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {q.choices.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs",
                    answers[q.id] === opt
                      ? "border-trails-accent bg-trails-accent/20 text-trails-accent"
                      : "border-trails-trim/60 text-trails-fg-dim hover:text-trails-accent",
                  )}
                >
                  {opt}
                </button>
              ))}
              <input
                type="text"
                placeholder="…or type your own"
                value={
                  q.choices.includes(answers[q.id] ?? "")
                    ? ""
                    : answers[q.id] ?? ""
                }
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
                className="flex-1 rounded-md border border-trails-trim/40 bg-black/30 px-2 py-1 text-xs text-trails-fg"
              />
            </div>
          ) : (
            <input
              type="text"
              value={answers[q.id] ?? ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
              }
              placeholder="Type your answer…"
              className="w-full rounded-md border border-trails-trim/40 bg-black/30 px-2 py-1.5 text-xs text-trails-fg"
            />
          )}
        </div>
      ))}
    </div>
  );

  const planView = (
    <div className="space-y-3 overflow-y-auto p-5 text-sm">
      <p className="text-xs text-trails-fg-dim">
        Proposed plan from the local model{model ? ` (${model})` : ""}. Review
        below — nothing is committed yet.
      </p>
      <div className="flex items-center gap-3 rounded-md border border-trails-trim/40 bg-black/20 p-2 text-xs">
        <span className="font-display uppercase tracking-wider text-trails-accent">
          On confirm:
        </span>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
          />
          Merge (append after existing chapters)
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
          />
          Replace (wipe + apply)
        </label>
      </div>
      <ol className="space-y-3">
        {plan.map((c, i) => {
          // Group nodes by tier for the preview.
          const byTier = new Map<number, PlanNode[]>();
          for (const n of c.nodes) {
            const arr = byTier.get(n.tier) ?? [];
            arr.push(n);
            byTier.set(n.tier, arr);
          }
          const tiers = [...byTier.keys()].sort((a, b) => a - b);
          return (
            <li
              key={i}
              className="rounded-md border border-trails-trim/40 bg-black/20 p-3"
              style={
                c.color
                  ? { borderTopWidth: 4, borderTopColor: c.color }
                  : undefined
              }
            >
              <div className="font-display text-xs uppercase tracking-widest text-trails-accent">
                Chapter {i + 1}: {c.title}
              </div>
              {c.notes && (
                <p className="mt-1 text-[11px] italic text-trails-fg-dim">
                  {c.notes}
                </p>
              )}
              <div className="mt-2 space-y-2">
                {tiers.map((t) => (
                  <div key={t}>
                    <p className="text-[10px] font-display uppercase tracking-widest text-trails-fg-dim">
                      Tier {t}
                      {(byTier.get(t)?.length ?? 0) > 1 && (
                        <span className="ml-1 text-trails-info">
                          · ⇉ parallel
                        </span>
                      )}
                    </p>
                    <ul className="mt-0.5 space-y-0.5 pl-3">
                      {(byTier.get(t) ?? []).map((n, j) => (
                        <li
                          key={j}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <span className="font-display text-[10px] uppercase tracking-wider text-trails-fg-dim">
                            {n.kind}
                          </span>
                          <span className="truncate text-trails-fg">
                            {refTitle.get(n.refId) ??
                              `(${n.kind} ${n.refId.slice(0, 8)}…)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-4">
      {step !== "intro" && (
        <button
          onClick={() => reset()}
          disabled={busy || success}
          className="jrpg-btn jrpg-btn--ghost inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-3 w-3" />
          Restart
        </button>
      )}
      <button
        onClick={() => {
          reset();
          onClose();
        }}
        disabled={busy && !success}
        className="jrpg-btn jrpg-btn--ghost"
      >
        Close
      </button>
      {step === "intro" && (
        <button
          onClick={() => runPlan()}
          disabled={busy}
          className="jrpg-btn inline-flex items-center gap-1"
        >
          <Sparkles className="h-3 w-3" />
          {busy ? "Asking the Guide…" : "Generate"}
        </button>
      )}
      {step === "questions" && (
        <button
          onClick={() => runPlan(questions)}
          disabled={
            busy ||
            questions.some(
              (q) => !answers[q.id] || answers[q.id].trim() === "",
            )
          }
          className="jrpg-btn inline-flex items-center gap-1"
        >
          <Sparkles className="h-3 w-3" />
          {busy ? "Generating…" : "Send answers + Generate"}
        </button>
      )}
      {step === "plan" && (
        <button
          onClick={confirmCommit}
          disabled={busy || success || plan.length === 0}
          className="jrpg-btn inline-flex items-center gap-1"
        >
          <Check className="h-3 w-3" />
          {busy
            ? "Committing…"
            : success
              ? "Done"
              : `Confirm · ${mode === "merge" ? "Merge" : "Replace"}`}
        </button>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
    >
      <div
        className="jrpg-panel relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <div>
            <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
              ✦ AI Generate · Chapter Board
            </h2>
            <p className="mt-1 text-xs text-jrpg-muted">
              Local · No cloud · No telemetry
            </p>
          </div>
          <button
            onClick={() => {
              if (!busy) {
                reset();
                onClose();
              }
            }}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === "intro" && intro}
        {step === "questions" && questionsView}
        {step === "plan" && planView}

        {error && (
          <p className="mx-5 mb-3 rounded-md border border-jrpg-crimson/60 bg-jrpg-crimson/10 p-2 text-xs text-jrpg-crimson">
            {error}
          </p>
        )}
        {success && (
          <p className="mx-5 mb-3 inline-flex items-center gap-1 font-display text-[11px] uppercase tracking-widest text-trails-good">
            <Check className="h-3 w-3" /> Chapters created.
          </p>
        )}

        {footer}
      </div>
    </div>
  );
}
