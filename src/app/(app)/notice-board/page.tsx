"use client";

import { useState } from "react";
import { Check, HelpCircle, Plus, Sparkles, Swords, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EntityIoControls } from "@/components/entity-io-controls";
import { DeadlineEditor } from "@/components/deadline-editor";

/** Coerce a timestamp (Date | ISO string | null) to a YYYY-MM-DD string. */
function toYMD(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * §7 — The Notice Board. Spontaneous one-off side quests, either user-added
 * or AI-generated. Completing one grants the XP immediately.
 */

const DIFFICULTY_META: Record<
  "trivial" | "normal" | "hard",
  { label: string; color: string; xp: number }
> = {
  trivial: {
    label: "Trivial",
    color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    xp: 5,
  },
  normal: {
    label: "Normal",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200",
    xp: 15,
  },
  hard: {
    label: "Hard",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200",
    xp: 40,
  },
};

export default function NoticeBoardPage() {
  const { data: quests, isLoading } = trpc.quest.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.quest.create.useMutation({
    onSuccess: () => utils.quest.list.invalidate(),
  });
  const toggle = trpc.quest.toggleComplete.useMutation({
    onSuccess: () => {
      utils.quest.list.invalidate();
      utils.skill.list.invalidate();
    },
  });
  const archive = trpc.quest.archive.useMutation({
    onSuccess: () => utils.quest.list.invalidate(),
  });
  const updateQuest = trpc.quest.update.useMutation({
    onSuccess: () => utils.quest.list.invalidate(),
  });
  const generate = trpc.advisor.generateSideQuests.useMutation();
  const acceptSuggested = trpc.advisor.acceptSideQuests.useMutation({
    onSuccess: () => {
      utils.quest.list.invalidate();
      generate.reset();
    },
  });

  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] =
    useState<"trivial" | "normal" | "hard">("normal");

  const sideQuests = (quests ?? []).filter((q) => q.cadence === "one_off");
  const active = sideQuests.filter((q) => !q.completedThisPeriod);
  const done = sideQuests.filter((q) => q.completedThisPeriod);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-trails-warn" />
            Notice Board
            <span
              title="One-off side quests with a difficulty rating. Completing them grants XP immediately. The AI Guide can generate fresh side quests from your overall context — useful when the long grind feels stale."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            One-off side quests for when the long grind feels stale.
          </p>
        </div>
        <EntityIoControls shape="quest" />
      </header>

      {/* Create form + AI generator */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New side quest..."
            className="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as "trivial" | "normal" | "hard")
            }
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="trivial">Trivial · 5 XP</option>
            <option value="normal">Normal · 15 XP</option>
            <option value="hard">Hard · 40 XP</option>
          </select>
          <button
            onClick={() => {
              if (!title.trim()) return;
              create.mutate({
                title,
                cadence: "one_off",
                difficulty,
                xpReward: DIFFICULTY_META[difficulty].xp,
              });
              setTitle("");
            }}
            disabled={create.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
          <button
            onClick={() => generate.mutate({ count: 3 })}
            disabled={generate.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            <Sparkles className="h-3 w-3" />
            {generate.isPending ? "Generating..." : "AI suggest"}
          </button>
        </div>

        {generate.data && generate.data.proposals.length > 0 && (
          <div className="mt-3 rounded-md border border-trails-accent/40 bg-trails-bg-glow/40 p-3">
            <p className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
              <Sparkles className="mr-1 inline h-3 w-3" />
              AI suggestions · {generate.data.model}
            </p>
            <ul className="mt-2 space-y-1.5">
              {generate.data.proposals.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-trails-fg"
                >
                  <span
                    className={
                      "rounded-full border border-trails-trim/40 px-2 py-0.5 text-[10px] font-medium " +
                      DIFFICULTY_META[p.difficulty].color
                    }
                  >
                    {p.difficulty}
                  </span>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="tabular-nums text-[10px] text-trails-accent">
                    +{p.xpReward} XP
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() =>
                acceptSuggested.mutate({ picks: generate.data!.proposals })
              }
              disabled={acceptSuggested.isPending}
              className="mt-2 w-full rounded-md bg-zinc-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Accept all
            </button>
          </div>
        )}
      </section>

      {/* Active */}
      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
          Active · {active.length}
        </h2>
        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : active.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No active side quests. Add one above or ask the AI for suggestions.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {active.map((q) => {
              const diff = q.difficulty as "trivial" | "normal" | "hard" | null;
              return (
                <li
                  key={q.id}
                  className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <button
                    onClick={() => toggle.mutate({ id: q.id })}
                    className="grid h-6 w-6 place-items-center rounded-md border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <Check className="h-3.5 w-3.5 text-transparent" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {q.title}
                      </span>
                      {q.aiSuggested && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          <Sparkles className="h-2 w-2" /> AI
                        </span>
                      )}
                    </div>
                    {q.description && (
                      <p className="text-xs text-zinc-500">{q.description}</p>
                    )}
                  </div>
                  {diff && (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        DIFFICULTY_META[diff].color
                      }
                    >
                      {DIFFICULTY_META[diff].label}
                    </span>
                  )}
                  <DeadlineEditor
                    value={toYMD(q.expiresAt)}
                    onSave={(d) =>
                      updateQuest.mutate({ id: q.id, expiresAt: d })
                    }
                    saving={
                      updateQuest.isPending &&
                      updateQuest.variables?.id === q.id
                    }
                    idleLabel="Expires"
                    tone="muted"
                  />
                  <span className="tabular-nums text-[10px] text-zinc-500">
                    +{q.xpReward} XP
                  </span>
                  <button
                    onClick={() => {
                      if (confirm("Archive this side quest?")) {
                        archive.mutate({ id: q.id });
                      }
                    }}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Completed */}
      {done.length > 0 && (
        <section>
          <h2 className="!m-0 !border-0 !p-0 mb-2 font-display text-[11px] uppercase tracking-widest text-trails-accent">
            Completed · {done.length}
          </h2>
          <ul className="space-y-1">
            {done.map((q) => (
              <li
                key={q.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-500 line-through dark:border-zinc-800 dark:bg-zinc-950"
              >
                <Check className="h-3 w-3 text-emerald-500" />
                <span className={cn("flex-1 truncate")}>{q.title}</span>
                <span className="tabular-nums">+{q.xpReward} XP</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
