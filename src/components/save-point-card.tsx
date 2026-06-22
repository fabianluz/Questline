"use client";

import { useEffect, useState } from "react";
import { Flame, HelpCircle, Sparkles, Tent } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * §10 — Save Point widget. Shown on the dashboard, refreshes weekly (Monday
 * UTC). Three reflective text fields with stats. The AI Guide can draft all
 * three from the past-week stats via the ✨ button.
 *
 * Trails palette: warm gold accent + cinzel section titles, no more
 * amber-on-amber light-mode chrome.
 */
export function SavePointCard() {
  const { data, isLoading } = trpc.wellbeing.getCurrentSavePoint.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.wellbeing.saveSavePoint.useMutation({
    onSuccess: () => utils.wellbeing.getCurrentSavePoint.invalidate(),
  });
  const draft = trpc.advisor.draftRetrospective.useMutation();

  const [wentWell, setWentWell] = useState("");
  const [struggled, setStruggled] = useState("");
  const [nextWeekFocus, setNextWeekFocus] = useState("");

  useEffect(() => {
    if (data?.existing) {
      setWentWell(data.existing.wentWell ?? "");
      setStruggled(data.existing.struggled ?? "");
      setNextWeekFocus(data.existing.nextWeekFocus ?? "");
    }
  }, [data?.existing?.id]);

  if (isLoading || !data) return null;

  async function generate() {
    if (!data) return;
    const result = await draft.mutateAsync({
      questsCompleted: data.stats.questsCompleted,
      milestonesCompleted: data.stats.milestonesCompleted,
      xpGained: data.stats.xpGained,
      topSkill: data.stats.topSkill?.name ?? null,
    });
    setWentWell(result.wentWell);
    setStruggled(result.struggled);
    setNextWeekFocus(result.nextWeekFocus);
  }

  return (
    <section className="rounded-lg border border-trails-accent/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tent className="h-4 w-4 text-trails-accent" />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Save Point · Week of {data.weekStart}
          </h2>
          <span
            title="A weekly retrospective. The AI Guide can draft these fields from your past-7-days stats. Editing later week-by-week keeps a written history of your progress."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <button
          onClick={generate}
          disabled={draft.isPending}
          title="Ask the AI Guide to fill in these three fields from your past-week stats"
          className="inline-flex items-center gap-1 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          {draft.isPending ? "Drafting..." : "AI draft"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Quests" value={data.stats.questsCompleted} />
        <Stat
          label="Milestones"
          value={data.stats.milestonesCompleted}
        />
        <Stat
          label="XP gained"
          value={data.stats.xpGained}
          icon={<Flame className="h-3 w-3 text-trails-warn" />}
        />
      </div>

      <div className="mt-3 space-y-2">
        <Field
          label="What went well"
          value={wentWell}
          onChange={setWentWell}
          placeholder="A win, a streak, a hard task you didn't avoid…"
        />
        <Field
          label="Where you struggled"
          value={struggled}
          onChange={setStruggled}
          placeholder="Be honest. This is a campfire, not a performance review."
        />
        <Field
          label="Focus for next week"
          value={nextWeekFocus}
          onChange={setNextWeekFocus}
          placeholder="One or two things you want to prioritize."
        />
      </div>

      <button
        onClick={() =>
          save.mutate({
            weekStart: data.weekStart,
            wentWell,
            struggled,
            nextWeekFocus,
          })
        }
        disabled={save.isPending}
        className="mt-3 w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {data.existing ? "Update Save Point" : "Save Point"}
      </button>
    </section>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-trails-trim/40 bg-trails-bg-deep/40 p-2">
      <div className="font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
        {label}
      </div>
      <div className="flex items-center justify-center gap-1 font-display text-lg font-bold tabular-nums text-trails-accent">
        {icon}
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block font-display text-[10px] uppercase tracking-widest text-trails-accent">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-md px-2 py-1 text-xs"
      />
    </div>
  );
}
