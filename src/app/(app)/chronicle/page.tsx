"use client";

import { Award, CalendarCheck, Flame, ScrollText, Timer, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

function heatColor(count: number): string {
  if (count <= 0) return "var(--trails-panel-dark)";
  if (count === 1) return "rgba(126,211,33,0.35)";
  if (count === 2) return "rgba(126,211,33,0.6)";
  if (count <= 4) return "rgba(126,211,33,0.8)";
  return "rgba(126,211,33,1)";
}
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
};

export default function ChroniclePage() {
  const { data, isLoading } = trpc.chronicle.get.useQuery();

  if (isLoading || !data) {
    return <p className="text-sm text-trails-fg-dim">Loading your chronicle…</p>;
  }

  const maxMonth = Math.max(1, ...data.milestonesByMonth.map((m) => m.count));
  const maxDomain = Math.max(1, ...data.focusByDomain.map((d) => d.minutes));
  const focusHours = (data.focusMinutes / 60).toFixed(1);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-trails-accent" />
          Chronicle
        </h1>
        <p className="mt-1 text-sm text-trails-fg-dim">
          Your record so far — consistency, output, and where your hours went.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<Award className="h-4 w-4 text-jrpg-gold" />} label="XP earned" value={data.xpEarned.toLocaleString()} />
        <Stat icon={<Flame className="h-4 w-4 text-trails-bad" />} label="Current streak" value={`${data.currentStreak}d`} />
        <Stat icon={<TrendingUp className="h-4 w-4 text-trails-good" />} label="Best streak" value={`${data.bestStreak}d`} />
        <Stat icon={<CalendarCheck className="h-4 w-4 text-trails-info" />} label="Milestones" value={String(data.completedMilestones)} />
        <Stat icon={<Timer className="h-4 w-4 text-jrpg-gold" />} label="Focus hours" value={focusHours} />
        <Stat icon={<Flame className="h-4 w-4 text-trails-accent" />} label="Last 7d" value={String(data.momentum)} />
      </div>

      {/* Quest heatmap */}
      <section className="jrpg-panel p-5">
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Quest consistency · last 18 weeks
        </h2>
        <div className="overflow-x-auto">
          <div
            className="grid w-max grid-flow-col gap-1"
            style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
          >
            {data.heatmap.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} completion${d.count === 1 ? "" : "s"}`}
                className="h-3 w-3 rounded-[2px]"
                style={{ backgroundColor: heatColor(d.count) }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-trails-fg-dim">
          Each square is a day; greener = more quests completed.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Milestones per month */}
        <section className="jrpg-panel p-5">
          <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
            Milestones completed · 12 months
          </h2>
          <div className="flex h-40 items-end gap-1">
            {data.milestonesByMonth.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-trails-info/70"
                    style={{ height: `${(m.count / maxMonth) * 100}%` }}
                    title={`${m.month}: ${m.count}`}
                  />
                </div>
                <span className="font-mono text-[8px] text-trails-fg-dim">
                  {fmtMonth(m.month)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Time by domain */}
        <section className="jrpg-panel p-5">
          <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
            Focus time by domain
          </h2>
          {data.focusByDomain.length === 0 ? (
            <p className="text-xs text-trails-fg-dim">
              No focus sessions logged yet. Start one from a step (the timer
              icon) to track deep-work time here.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.focusByDomain.map((d) => (
                <li key={d.domain}>
                  <div className="mb-0.5 flex justify-between text-xs text-trails-fg">
                    <span>{d.domain}</span>
                    <span className="font-mono text-trails-fg-dim">
                      {(d.minutes / 60).toFixed(1)}h
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-trails-panel-dark">
                    <div
                      className="h-full rounded-full bg-jrpg-gold/70"
                      style={{ width: `${(d.minutes / maxDomain) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="jrpg-panel p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-trails-fg-dim">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-trails-fg">
        {value}
      </div>
    </div>
  );
}
