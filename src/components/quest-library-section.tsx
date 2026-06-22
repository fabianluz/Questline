"use client";

import { useMemo, useState } from "react";
import { Check, HelpCircle, Plus, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  QUEST_LIBRARY,
  QUEST_LIBRARY_GROUPS,
  type QuestTemplate,
} from "@/lib/quest-library";
import { cn } from "@/lib/utils";

/**
 * Quick-add panel on /quests. The library lives in `lib/quest-library.ts`
 * (pure data, not in the DB). Clicking a button creates the matching
 * recurring quest in one shot.
 *
 * Dedup: if a quest with the same title already exists (case-insensitive),
 * the button is rendered "✓ added" and disabled so the user can't create
 * duplicates by re-clicking.
 *
 * The suggested skill is automatically wired if the user already has a
 * Skill with that exact name. Otherwise the quest is created skill-less
 * and the suggestion is shown as a small chip the user can hover.
 */
export function QuestLibrarySection() {
  const utils = trpc.useUtils();
  const { data: quests } = trpc.quest.list.useQuery();
  const { data: skills } = trpc.skill.list.useQuery();

  const create = trpc.quest.create.useMutation({
    onSuccess: () => {
      utils.quest.list.invalidate();
      utils.skill.list.invalidate();
      // Light "just added" feedback handled via the dedup check below.
    },
  });

  const [activeGroup, setActiveGroup] =
    useState<QuestTemplate["group"]>("movement");

  const existingTitles = useMemo(() => {
    const m = new Map<string, string>(); // lowercased title → quest id
    for (const q of quests ?? []) {
      m.set(q.title.trim().toLowerCase(), q.id);
    }
    return m;
  }, [quests]);

  const skillByName = useMemo(() => {
    const m = new Map<string, string>(); // skill name → skill id
    for (const s of skills ?? []) m.set(s.name, s.id);
    return m;
  }, [skills]);

  function isAdded(t: QuestTemplate): boolean {
    return existingTitles.has(t.title.trim().toLowerCase());
  }

  function addFromTemplate(t: QuestTemplate) {
    if (isAdded(t)) return;
    const skillId = t.suggestedSkill
      ? skillByName.get(t.suggestedSkill) ?? null
      : null;
    create.mutate({
      title: t.title,
      description: t.description,
      cadence: t.cadence,
      xpReward: t.xpReward,
      skillId,
    });
  }

  const filtered = QUEST_LIBRARY.filter((t) => t.group === activeGroup);

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-trails-accent" />
        <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
          Quick add from library
        </h2>
        <span
          title="Curated daily / weekly habits. Click a button to create the matching recurring quest. If you already have a Skill with the suggested name, it's linked automatically and completions grant that Skill XP."
          className="text-trails-info"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-xs text-trails-fg-dim">
        One click = one recurring quest. Already-added ones show ✓ and can't
        be duplicated. The custom form below is still there if your habit
        isn't in the library.
      </p>

      {/* Group tabs */}
      <div className="mt-3 flex flex-wrap gap-1">
        {QUEST_LIBRARY_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setActiveGroup(g.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-display text-[10px] uppercase tracking-widest transition",
              activeGroup === g.key
                ? "border-trails-accent bg-trails-accent/15 text-trails-accent-bright"
                : "border-trails-trim/40 text-trails-fg-dim hover:text-trails-accent",
            )}
          >
            <span aria-hidden>{g.emoji}</span>
            {g.label}
          </button>
        ))}
      </div>

      {/* Template buttons */}
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {filtered.map((t) => {
          const added = isAdded(t);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => addFromTemplate(t)}
                disabled={added || create.isPending}
                title={
                  added
                    ? `"${t.title}" is already in your quests`
                    : `Add "${t.title}" as a recurring ${t.cadence} quest (+${t.xpReward} XP${
                        t.suggestedSkill
                          ? `${skillByName.has(t.suggestedSkill) ? ` → ${t.suggestedSkill}` : ` · will link to "${t.suggestedSkill}" Skill if you create it later`}`
                          : ""
                      })`
                }
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  added
                    ? "border-trails-good/50 bg-trails-good/10 text-trails-good cursor-default"
                    : "border-trails-trim-soft/50 hover:border-trails-accent hover:bg-trails-accent/10",
                )}
              >
                <span className="text-base" aria-hidden>
                  {t.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-trails-fg">
                      {t.title}
                    </span>
                    {t.cadence === "weekly" && (
                      <span className="rounded-full border border-trails-info/40 bg-trails-info/15 px-1.5 py-0.5 font-display text-[8px] uppercase tracking-widest text-trails-info">
                        weekly
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="truncate text-[10px] text-trails-fg-dim">
                      {t.description}
                    </p>
                  )}
                  {t.suggestedSkill && (
                    <p
                      className="mt-0.5 truncate font-mono text-[10px] text-trails-accent"
                      title={
                        skillByName.has(t.suggestedSkill)
                          ? `Will auto-link to your "${t.suggestedSkill}" Skill`
                          : `Suggested Skill "${t.suggestedSkill}" — create one on /skills if you want XP to count`
                      }
                    >
                      → {t.suggestedSkill}
                      {!skillByName.has(t.suggestedSkill) && " (skill not yet created)"}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-trails-fg-dim">
                  +{t.xpReward} XP
                </span>
                {added ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-trails-good" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0 text-trails-fg-dim group-hover:text-trails-accent" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
