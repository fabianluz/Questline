"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, Flame, HelpCircle, Swords } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Dashboard widget: today's daily quests with optimistic check-off.
 *
 * Why a dedicated component (split from the dashboard page):
 *   1. Optimistic update on toggle — the previous inline version waited for
 *      the server round-trip before flipping the checkbox, which made it
 *      feel broken. We now flip visually on click and reconcile on success.
 *   2. The checkbox was replaced with a full-row button + circle icon. A
 *      native HTML checkbox is a 16×16 hit target; the row-button is the
 *      full ~280px row, much easier to hit.
 *   3. Inline hint text + per-element `title` tooltips explain what each
 *      part does — what the streak count means, why the checkmark is
 *      green, etc.
 */
export function TodaysQuestsCard() {
  const utils = trpc.useUtils();
  const { data: quests, isLoading } = trpc.quest.list.useQuery();

  // Local override map so we can flip a quest's "done" state instantly on
  // click without waiting for the server. Reconciled when the query refetches.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const toggle = trpc.quest.toggleComplete.useMutation({
    onMutate: ({ id }) => {
      const before = quests?.find((q) => q.id === id)?.completedThisPeriod;
      setPending((p) => ({ ...p, [id]: !before }));
    },
    onSuccess: (_data, { id }) => {
      utils.quest.list.invalidate();
      utils.skill.list.invalidate();
      // Clear the override after the refetch lands.
      setTimeout(() => {
        setPending((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      }, 600);
    },
    onError: (_err, { id }) => {
      // Rollback the optimistic flip.
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    },
  });

  function isComplete(q: { id: string; completedThisPeriod: boolean }) {
    return pending[q.id] ?? q.completedThisPeriod;
  }

  const dailies = (quests ?? []).filter((q) => q.cadence === "daily");

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-trails-warn" />
          <h2 className="!m-0 !border-0 !p-0 text-sm font-semibold">
            Today's Quests
          </h2>
          <span
            title="Daily quests reset every UTC day. Click the circle (or anywhere on the row) to mark it complete and earn its XP — completing a quest grants XP to its linked Skill. Maintaining a streak rewards consecutive days completed."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <Link
          href="/quests"
          title="Open the full Quests page to add new quests, change difficulty, archive, or change which skill they grant XP to."
          className="text-xs text-trails-fg-dim hover:text-trails-accent"
        >
          Manage quests →
        </Link>
      </div>

      <p className="mt-1 text-[11px] text-trails-fg-dim">
        Click a row to mark complete. The flame icon shows your current
        streak in days.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-trails-fg-dim">Loading...</p>
      ) : dailies.length === 0 ? (
        <p className="mt-3 text-sm text-trails-fg-dim">
          No daily quests yet.{" "}
          <Link href="/quests" className="underline">
            Add one
          </Link>{" "}
          to start a streak.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {dailies.map((q) => {
            const done = isComplete(q);
            const Icon = done ? CheckCircle2 : Circle;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: q.id })}
                  title={
                    done
                      ? `Click to un-mark "${q.title}" for today (revokes ${q.xpReward} XP)`
                      : `Click to mark "${q.title}" complete for today (+${q.xpReward} XP${q.skill ? ` to ${q.skill.name}` : ""})`
                  }
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-trails-trim-soft hover:bg-trails-bg-glow/40",
                    done && "opacity-60",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      done
                        ? "text-trails-good"
                        : "text-trails-fg-dim group-hover:text-trails-accent",
                    )}
                  />
                  <span
                    className={cn(
                      "flex-1 truncate text-sm",
                      done && "text-trails-fg-dim line-through",
                    )}
                  >
                    {q.title}
                  </span>
                  <span
                    className="shrink-0 text-[10px] tabular-nums text-trails-fg-dim"
                    title={`Completing this quest grants ${q.xpReward} XP${q.skill ? ` to ${q.skill.name}` : ""}.`}
                  >
                    +{q.xpReward} XP
                  </span>
                  {q.streak > 0 && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-trails-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-trails-warn"
                      title={`${q.streak} consecutive day${q.streak === 1 ? "" : "s"} completed. Missing a day resets the streak.`}
                    >
                      <Flame className="h-2.5 w-2.5" />
                      {q.streak}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
