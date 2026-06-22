"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Flame,
  HelpCircle,
  Sparkles,
  Swords,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EntityIoControls } from "@/components/entity-io-controls";
import { QuestLibrarySection } from "@/components/quest-library-section";

type Cadence = "daily" | "weekly";

/**
 * /quests — full CRUD for daily + weekly recurring habits.
 *
 * Themed under the Trails palette: Cinzel section headings, Trails-semantic
 * status colors, click-the-whole-row optimistic toggling (matches the
 * dashboard widget). XP + streak badges live inline next to each title.
 */
export default function QuestsPage() {
  const utils = trpc.useUtils();
  const { data: quests, isLoading } = trpc.quest.list.useQuery();
  const { data: skills } = trpc.skill.list.useQuery();

  const invalidate = () => {
    utils.quest.list.invalidate();
    utils.skill.list.invalidate();
  };

  const create = trpc.quest.create.useMutation({
    onSuccess: () => {
      invalidate();
      setTitle("");
      setDescription("");
      setXp(10);
      setSkillId("");
      setStartDate("");
      setEndDate("");
      setTimesPerPeriod("");
    },
  });

  // Local override map so toggles flip instantly without waiting on the
  // server round-trip. Mirrors the dashboard's TodaysQuestsCard pattern.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toggleComplete = trpc.quest.toggleComplete.useMutation({
    onMutate: ({ id }) => {
      const before = (quests ?? []).find((q) => q.id === id)
        ?.completedThisPeriod;
      setPending((p) => ({ ...p, [id]: !before }));
    },
    onSuccess: (_d, { id }) => {
      invalidate();
      setTimeout(() => {
        setPending((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      }, 600);
    },
    onError: (_e, { id }) => {
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    },
  });
  const archive = trpc.quest.archive.useMutation({ onSuccess: invalidate });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [xp, setXp] = useState(10);
  const [skillId, setSkillId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timesPerPeriod, setTimesPerPeriod] = useState("");

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      cadence,
      xpReward: xp,
      skillId: skillId || null,
      startDate: startDate || null,
      endDate: endDate || null,
      timesPerPeriod: timesPerPeriod ? Number(timesPerPeriod) : null,
    });
  }

  function isComplete(q: { id: string; completedThisPeriod: boolean }) {
    return pending[q.id] ?? q.completedThisPeriod;
  }

  const daily = (quests ?? []).filter((q) => q.cadence === "daily");
  const weekly = (quests ?? []).filter((q) => q.cadence === "weekly");

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-trails-warn" />
            Daily Quests
            <span
              title="Recurring habits that grant XP to a linked Skill. Daily quests reset every UTC day; weekly quests reset every Monday UTC. Maintain a streak by completing on consecutive periods."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Click a row to mark complete. The 🔥 flame counts consecutive
            periods. Link a Skill so completions grant XP toward leveling.
          </p>
        </div>
        <EntityIoControls shape="quest" />
      </header>

      <QuestLibrarySection />

      <form
        onSubmit={onCreate}
        className="rounded-lg border p-4"
      >
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 text-sm">
          <Sparkles className="h-3.5 w-3.5 text-trails-accent" />
          Custom Quest
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title (e.g. Read 10 pages)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md px-3 py-2 text-sm sm:col-span-2"
          />
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
              Cadence
            </span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className="w-full !border-0 !bg-transparent text-sm focus:outline-none"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
              XP / completion
            </span>
            <input
              type="number"
              min={0}
              max={1000}
              value={xp}
              onChange={(e) =>
                setXp(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full !border-0 !bg-transparent text-sm tabular-nums focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm sm:col-span-2">
            <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
              Skill (optional)
            </span>
            <select
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className="w-full !border-0 !bg-transparent text-sm focus:outline-none"
            >
              <option value="">— no skill —</option>
              {skills?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Lv {s.level})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span
              className="font-display text-[10px] uppercase tracking-widest text-trails-accent"
              title="Quest stays hidden until this date — e.g. a habit that begins after exams."
            >
              Active from
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full !border-0 !bg-transparent text-sm focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span
              className="font-display text-[10px] uppercase tracking-widest text-trails-accent"
              title="Quest disappears after this date. Leave blank for an open-ended habit."
            >
              Active until
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full !border-0 !bg-transparent text-sm focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm sm:col-span-2">
            <span
              className="font-display text-[10px] uppercase tracking-widest text-trails-accent"
              title="Target completions per period — e.g. 4 for a gym habit 4×/week. Optional."
            >
              Target / period
            </span>
            <input
              type="number"
              min={1}
              max={100}
              placeholder="optional (e.g. 4×/week)"
              value={timesPerPeriod}
              onChange={(e) => setTimesPerPeriod(e.target.value)}
              className="w-full !border-0 !bg-transparent text-sm tabular-nums focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending || !title.trim()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 sm:col-span-2"
          >
            {create.isPending ? "Creating..." : "Add Quest"}
          </button>
        </div>
      </form>

      <QuestSection
        label="Today"
        cadence="daily"
        quests={daily as QuestRow[]}
        isLoading={isLoading}
        isComplete={isComplete}
        onToggle={(id) => toggleComplete.mutate({ id })}
        onArchive={(id) => {
          if (confirm("Archive this quest?")) archive.mutate({ id });
        }}
        emptyHint="No daily quests yet. Add one above to start a streak."
      />

      <QuestSection
        label="This week"
        cadence="weekly"
        quests={weekly as QuestRow[]}
        isLoading={isLoading}
        isComplete={isComplete}
        onToggle={(id) => toggleComplete.mutate({ id })}
        onArchive={(id) => {
          if (confirm("Archive this quest?")) archive.mutate({ id });
        }}
        emptyHint="No weekly quests yet."
      />
    </div>
  );
}

type QuestRow = {
  id: string;
  title: string;
  description: string | null;
  cadence: Cadence;
  xpReward: number;
  skill: { id: string; name: string } | null;
  completedThisPeriod: boolean;
  streak: number;
  endDate: string | null;
  timesPerPeriod: number | null;
};

function QuestSection({
  label,
  cadence,
  quests,
  isLoading,
  isComplete,
  onToggle,
  onArchive,
  emptyHint,
}: {
  label: string;
  cadence: Cadence;
  quests: QuestRow[];
  isLoading: boolean;
  isComplete: (q: QuestRow) => boolean;
  onToggle: (id: string) => void;
  onArchive: (id: string) => void;
  emptyHint: string;
}) {
  return (
    <section>
      <h2 className="!m-0 !border-0 !p-0 mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
        {label}
        <span className="font-mono text-[10px] text-trails-fg-dim normal-case tracking-normal">
          ({quests.length})
        </span>
      </h2>
      {isLoading ? (
        <p className="text-sm text-trails-fg-dim">Loading...</p>
      ) : quests.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-trails-fg-dim">
          {emptyHint}
        </p>
      ) : (
        <ul className="divide-y divide-trails-trim/20 rounded-lg border">
          {quests.map((q) => (
            <QuestItem
              key={q.id}
              quest={q}
              cadence={cadence}
              done={isComplete(q)}
              onToggle={() => onToggle(q.id)}
              onArchive={() => onArchive(q.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestItem({
  quest,
  cadence,
  done,
  onToggle,
  onArchive,
}: {
  quest: QuestRow;
  cadence: Cadence;
  done: boolean;
  onToggle: () => void;
  onArchive: () => void;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        title={
          done
            ? `Click to un-mark "${quest.title}" for this ${cadence === "daily" ? "day" : "week"} (revokes ${quest.xpReward} XP)`
            : `Click to mark "${quest.title}" complete (+${quest.xpReward} XP${quest.skill ? ` to ${quest.skill.name}` : ""})`
        }
        className={cn(
          "group flex flex-1 items-start gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-trails-trim-soft hover:bg-trails-bg-glow/40",
          done && "opacity-60",
        )}
      >
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 transition-colors",
            done
              ? "text-trails-good"
              : "text-trails-fg-dim group-hover:text-trails-accent",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                done && "text-trails-fg-dim line-through",
              )}
            >
              {quest.title}
            </span>
            {quest.streak > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-trails-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-trails-warn"
                title={`${quest.streak} consecutive ${cadence === "daily" ? "day" : "week"}${quest.streak === 1 ? "" : "s"}`}
              >
                <Flame className="h-2.5 w-2.5" />
                {quest.streak}
              </span>
            )}
            {quest.skill && quest.xpReward > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-trails-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-trails-accent"
                title={`Each completion grants ${quest.xpReward} XP to ${quest.skill.name}`}
              >
                <Sparkles className="h-2.5 w-2.5" />
                +{quest.xpReward} {quest.skill.name}
              </span>
            )}
            {quest.timesPerPeriod != null && quest.timesPerPeriod > 1 && (
              <span
                className="inline-flex items-center rounded-full bg-trails-info/15 px-1.5 py-0.5 text-[10px] font-medium text-trails-info"
                title={`Target: ${quest.timesPerPeriod}× per ${cadence === "daily" ? "day" : "week"}`}
              >
                {quest.timesPerPeriod}×/{cadence === "daily" ? "day" : "wk"}
              </span>
            )}
            {quest.endDate && (
              <span
                className="inline-flex items-center rounded-full bg-trails-fg-dim/15 px-1.5 py-0.5 text-[10px] font-medium text-trails-fg-dim"
                title={`This quest retires on ${quest.endDate}`}
              >
                until {quest.endDate}
              </span>
            )}
          </div>
          {quest.description && (
            <p className="mt-0.5 text-xs text-trails-fg-dim">
              {quest.description}
            </p>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onArchive}
        title="Archive this quest"
        className="rounded-md border px-1.5 py-1.5 text-trails-fg-dim hover:bg-trails-bg-glow hover:text-trails-bad"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
