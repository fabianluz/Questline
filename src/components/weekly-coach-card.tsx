"use client";

import { Compass, Sparkles, Target, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";
import { RichText } from "@/components/rich-text";
import { ListenButton } from "@/components/listen-button";

/**
 * Weekly Coach — an on-demand local briefing. Runs the warm Ollama model over
 * the user's live roadmap and returns three short sections. Strictly local;
 * no data leaves the machine.
 */
export function WeeklyCoachCard() {
  const toast = useToast();
  const coach = trpc.advisor.weeklyCoach.useMutation({
    onError: (err) =>
      toast({ title: "Coach unavailable", description: err.message, variant: "error" }),
  });
  const data = coach.data;

  return (
    <section className="jrpg-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-trails-accent" aria-hidden />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Weekly Coach
          </h2>
          <span className="text-[11px] text-trails-fg-dim">· local AI briefing</span>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <ListenButton
              text={[data.priorities, data.risks, data.encouragement]
                .filter(Boolean)
                .join(". ")}
            />
          )}
          <button
            onClick={() => coach.mutate()}
            disabled={coach.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {coach.isPending
              ? "Consulting…"
              : data
                ? "Refresh briefing"
                : "Brief me on this week"}
          </button>
        </div>
      </div>

      {!data && !coach.isPending && (
        <p className="text-sm text-trails-fg-dim">
          Get a short, concrete plan for the week ahead — your top priorities,
          what&apos;s at risk, and a word of encouragement. Generated on-device.
        </p>
      )}

      {coach.isPending && (
        <p className="animate-pulse text-sm text-trails-fg-dim">
          The Guide is reviewing your roadmap…
        </p>
      )}

      {data && (
        <div className="space-y-4">
          {data.priorities && (
            <CoachSection
              icon={<Target className="h-3.5 w-3.5 text-trails-good" aria-hidden />}
              title="Priorities"
              body={data.priorities}
            />
          )}
          {data.risks && (
            <CoachSection
              icon={<TriangleAlert className="h-3.5 w-3.5 text-trails-bad" aria-hidden />}
              title="Watch"
              body={data.risks}
            />
          )}
          {data.encouragement && (
            <div className="border-l-2 border-jrpg-gold/60 pl-3 text-sm italic text-trails-fg">
              <RichText text={data.encouragement} />
            </div>
          )}
          <p className="text-[10px] text-trails-fg-dim">
            {data.model} · {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

function CoachSection({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  // RichText handles bullets, **bold**/_italic_, `code`, and LaTeX `$math$` /
  // `$$block$$`, so the model's formatting (and any formulas) render cleanly.
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-widest text-trails-fg-dim">
        {icon}
        {title}
      </div>
      <RichText text={body} className="text-sm text-trails-fg" />
    </div>
  );
}
