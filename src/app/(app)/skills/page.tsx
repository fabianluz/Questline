"use client";

import { useState } from "react";
import { HelpCircle, List, Network, Sparkles, Star, Trash2, TrendingUp, Wand2, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EntityIoControls } from "@/components/entity-io-controls";
import { DeadlineEditor } from "@/components/deadline-editor";
import { SkillConstellation } from "@/components/skill/skill-constellation";
import { SkillAiCreate } from "@/components/skill/skill-ai-create";
import { domainColor } from "@/lib/skill-tree-layout";

/** Suggested domains offered in the datalist (free text still allowed). */
const DOMAIN_SUGGESTIONS = [
  "Tech",
  "Language",
  "Body",
  "Mind",
  "Finance",
  "Career",
  "Creative",
];

export default function SkillsPage() {
  const utils = trpc.useUtils();
  const { data: skills, isLoading } = trpc.skill.list.useQuery();

  const invalidate = () => {
    utils.skill.list.invalidate();
    utils.epic.byId.invalidate();
  };

  const create = trpc.skill.create.useMutation({
    onSuccess: () => {
      invalidate();
      setName("");
      setDescription("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const del = trpc.skill.delete.useMutation({ onSuccess: invalidate });
  const update = trpc.skill.update.useMutation({
    onSuccess: invalidate,
    onError: (e) => setError(e.message),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "tree">("list");
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="space-y-8">
      <SkillAiCreate open={aiOpen} onClose={() => setAiOpen(false)} />
      <datalist id="skill-domains">
        {DOMAIN_SUGGESTIONS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Star className="h-5 w-5 text-trails-accent" />
            Skills
            <span
              title="Competencies that gain XP whenever a linked Milestone or Quest is completed. Levels follow an N² curve: Lv 1 = 100 XP, Lv 5 = 2,500 XP, Lv 10 = 10,000 XP. Link skills from each Epic's milestone editor or from the Quest create form."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Completed Milestones grant 100 XP per linked skill. Daily/weekly
            Quests grant their <code className="font-mono">xpReward</code> on
            each completion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-trails-trim/40 p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 font-display text-[11px] uppercase tracking-widest transition",
                view === "list"
                  ? "bg-trails-accent/15 text-trails-accent-bright"
                  : "text-trails-fg-dim hover:text-trails-accent",
              )}
            >
              <List className="h-3 w-3" />
              List
            </button>
            <button
              onClick={() => setView("tree")}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2.5 py-1 font-display text-[11px] uppercase tracking-widest transition",
                view === "tree"
                  ? "bg-trails-accent/15 text-trails-accent-bright"
                  : "text-trails-fg-dim hover:text-trails-accent",
              )}
            >
              <Network className="h-3 w-3" />
              Constellation
            </button>
          </div>
          <button
            onClick={() => setAiOpen(true)}
            title="Pick an Epic's milestones and let the local AI suggest skills from their steps"
            className="inline-flex items-center gap-1.5 rounded-md border border-jrpg-gold/50 bg-jrpg-gold/10 px-2.5 py-1 font-display text-[11px] uppercase tracking-widest text-jrpg-gold hover:bg-jrpg-gold/20"
          >
            <Wand2 className="h-3 w-3" />
            Create with AI
          </button>
          <EntityIoControls shape="skill" />
        </div>
      </header>

      {view === "tree" ? (
        <SkillConstellation />
      ) : (
      <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate({
            name: name.trim(),
            description: description.trim() || undefined,
          });
        }}
        className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="!m-0 !border-0 !p-0 text-sm">New Skill</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            placeholder="Name (e.g. Japanese: Reading)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {create.isPending ? "Creating..." : "Add"}
          </button>
        </div>
        {error && (
          <p className="mt-2 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-sm text-trails-bad">
            {error}
          </p>
        )}
      </form>

      {skills && skills.length > 0 && <SkillMomentum skills={skills} />}

      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Your Skills · {skills?.length ?? 0}
        </h2>
        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : !skills?.length ? (
          <p className="text-sm text-zinc-500">
            No skills yet. Create one above to start tracking XP.
          </p>
        ) : (
          <ul className="divide-y divide-trails-trim/20 rounded-lg border">
            {skills.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <SkillRow
                  skill={s}
                  saving={update.isPending && update.variables?.id === s.id}
                  onUpdate={(patch) => update.mutate({ id: s.id, ...patch })}
                  onDelete={() => {
                    if (
                      confirm(
                        `Delete "${s.name}"? It will be unlinked from all milestones.`,
                      )
                    ) {
                      del.mutate({ id: s.id });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </div>
  );
}

type SkillRowData = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  domain: string | null;
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpNeededForLevel: number;
  xpToNext: number;
  progress: number;
  milestoneCount: number;
  weeklyXp: number;
};

function SkillRow({
  skill,
  saving,
  onUpdate,
  onDelete,
}: {
  skill: SkillRowData;
  saving: boolean;
  onUpdate: (patch: {
    name?: string;
    description?: string | null;
    targetDate?: string | null;
    domain?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const progressPct = Math.round(skill.progress * 100);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border-2 border-trails-accent/60 bg-trails-bg-deep/60 text-trails-accent"
        title={`Level ${skill.level} · ${skill.totalXp.toLocaleString()} XP total`}
      >
        <span className="font-display text-[8px] uppercase tracking-widest leading-none">
          Lv
        </span>
        <span className="font-display text-base font-bold leading-none">
          {skill.level}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-trails-accent" />
          {editingName ? (
            <input
              type="text"
              defaultValue={skill.name}
              autoFocus
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== skill.name) onUpdate({ name: v });
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="min-w-0 flex-1 rounded-md border border-trails-accent/50 bg-trails-bg-deep/70 px-1.5 py-0.5 text-sm text-trails-fg focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="Click to rename"
              className="truncate text-left text-sm font-semibold text-trails-fg hover:text-trails-accent"
            >
              {skill.name}
            </button>
          )}
          <span className="font-mono text-[11px] text-trails-fg-dim">
            · {skill.milestoneCount}{" "}
            {skill.milestoneCount === 1 ? "milestone" : "milestones"}
          </span>
          <DeadlineEditor
            value={skill.targetDate}
            onSave={(d) => onUpdate({ targetDate: d })}
            saving={saving}
            idleLabel="Acquire by"
          />
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: domainColor(skill.domain) }}
            />
            <input
              list="skill-domains"
              defaultValue={skill.domain ?? ""}
              placeholder="domain"
              title="Group this skill into a domain (colours the constellation)"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (skill.domain ?? ""))
                  onUpdate({ domain: v || null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-24 rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-0.5 text-[11px] text-trails-fg focus:outline-none focus:ring-1 focus:ring-trails-accent/40"
            />
          </span>
        </div>
        {editingDesc ? (
          <input
            type="text"
            defaultValue={skill.description ?? ""}
            autoFocus
            placeholder="Description"
            onBlur={(e) => {
              const v = e.target.value.trim();
              onUpdate({ description: v || null });
              setEditingDesc(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingDesc(false);
            }}
            className="mt-1 w-full rounded-md border border-trails-accent/50 bg-trails-bg-deep/70 px-1.5 py-0.5 text-xs text-trails-fg focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDesc(true)}
            title="Click to edit description"
            className="mt-0.5 block max-w-full truncate text-left text-xs text-trails-fg-dim hover:text-trails-accent"
          >
            {skill.description || "+ description"}
          </button>
        )}
        <div className="mt-2 flex items-center gap-3">
          <div
            className="relative h-2 flex-1 overflow-hidden rounded-full border border-trails-trim/40 bg-trails-bg-deep/70"
            title={`${progressPct}% to next level`}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-trails-accent to-trails-accent-bright transition-[width]",
                progressPct === 0 && "bg-transparent",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-trails-fg-dim">
            {skill.xpInLevel.toLocaleString()}/
            {skill.xpNeededForLevel.toLocaleString()} XP
          </span>
          {skill.weeklyXp > 0 && (
            <span
              title="XP earned in the last 7 days"
              className="shrink-0 rounded-sm border border-trails-good/50 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-trails-good"
            >
              +{skill.weeklyXp.toLocaleString()} this week
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        title="Delete this skill (it will be unlinked from every milestone and quest first)"
        className="rounded-md border px-2 py-1.5 text-trails-fg-dim hover:bg-trails-bg-glow hover:text-trails-bad"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * A two-stat momentum banner: total XP earned across all skills in the last
 * 7 days, and the skill that needs the least XP to reach its next level.
 */
function SkillMomentum({
  skills,
}: {
  skills: { name: string; level: number; xpToNext: number; weeklyXp: number }[];
}) {
  const weeklyTotal = skills.reduce((sum, s) => sum + s.weeklyXp, 0);
  const closest = [...skills].sort((a, b) => a.xpToNext - b.xpToNext)[0];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="jrpg-panel flex items-center gap-3 p-4">
        <TrendingUp className="h-5 w-5 shrink-0 text-trails-good" />
        <div>
          <div className="text-[10px] uppercase tracking-widest text-trails-fg-dim">
            XP this week
          </div>
          <div className="text-lg font-semibold text-trails-fg">
            {weeklyTotal > 0 ? `+${weeklyTotal.toLocaleString()}` : "0"} XP
          </div>
        </div>
      </div>
      {closest && (
        <div className="jrpg-panel flex items-center gap-3 p-4">
          <Zap className="h-5 w-5 shrink-0 text-jrpg-gold" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-trails-fg-dim">
              Closest to leveling up
            </div>
            <div className="truncate text-sm font-semibold text-trails-fg">
              {closest.name}{" "}
              <span className="font-mono text-xs text-trails-fg-dim">
                · {closest.xpToNext.toLocaleString()} XP → Lv {closest.level + 1}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
