"use client";

import { useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CalendarClock, CheckCircle2, Circle, Lock, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UrgencyState } from "@/lib/urgency";

export type MilestoneNodeData = {
  title: string;
  status: "not_started" | "in_progress" | "completed" | "paused" | "abandoned";
  isLocked: boolean;
  available: boolean;
  tier: number;
  stepProgress: { completed: number; total: number };
  epicId: string;
  epicTitle: string;
  categoryColor: string | null;
  urgency?: UrgencyState;
  startDate: string | null;
  deadline: string | null;
  description: string | null;
  skills: string[];
  requires: string[];
  lockedBy: string[];
  unlocks: string[];
  prereqCount: number;
};

export type MilestoneFlowNode = Node<MilestoneNodeData, "milestone">;

const statusStyles: Record<
  MilestoneNodeData["status"],
  { icon: typeof Circle; iconClass: string; stripe: string; label: string }
> = {
  not_started: { icon: Circle, iconClass: "text-trails-fg-dim", stripe: "bg-trails-trim-soft/60", label: "Not started" },
  in_progress: { icon: Circle, iconClass: "text-trails-info", stripe: "bg-trails-info", label: "In progress" },
  completed: { icon: CheckCircle2, iconClass: "text-trails-good", stripe: "bg-trails-good", label: "Completed" },
  paused: { icon: Pause, iconClass: "text-trails-warn", stripe: "bg-trails-warn", label: "Paused" },
  abandoned: { icon: X, iconClass: "text-trails-bad", stripe: "bg-trails-bad", label: "Abandoned" },
};

/** Days until an ISO date; negative = past. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00").getTime() - t.getTime()) / 86_400_000);
}

export function MilestoneNode({ data, selected }: NodeProps<MilestoneFlowNode>) {
  const s = statusStyles[data.status];
  const StatusIcon = s.icon;
  const done = data.status === "completed";
  const dLeft = daysUntil(data.deadline);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        // Fixed width MUST match MILESTONE_W in tree-layout.ts — an auto-growing
        // card (long titles) overflows the space Dagre reserves and the columns
        // overlap. Title wraps to 2 lines inside this fixed box instead.
        "relative w-[240px] overflow-hidden rounded-md border px-3 py-2.5 transition-all",
        data.isLocked && "opacity-50",
        done && "opacity-75",
        data.available && "ring-2 ring-trails-accent/60",
        selected && "ring-2 ring-trails-accent",
        data.urgency && `urgency-${data.urgency}`,
      )}
      style={
        data.categoryColor
          ? { borderLeftWidth: 4, borderLeftColor: data.categoryColor, borderLeftStyle: "solid" }
          : undefined
      }
    >
      <NodeToolbar isVisible={hover} position={Position.Top} offset={10}>
        <MilestoneTooltip data={data} statusLabel={s.label} dLeft={dLeft} />
      </NodeToolbar>

      <span className={cn("absolute inset-x-0 top-0 h-0.5", s.stripe)} aria-hidden />

      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-trails-trim !bg-trails-bg-deep" />

      <div className="flex items-start gap-2">
        {data.isLocked ? (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-trails-fg-dim" aria-label="locked" />
        ) : (
          <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", s.iconClass)} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[10px] font-semibold uppercase tracking-wider text-trails-accent">
            {data.epicTitle} <span className="opacity-60">· T{data.tier}</span>
          </div>
          <div className={cn("mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-trails-fg", done && "line-through")}>
            {data.title}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {data.deadline && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1 py-0 text-[9px] font-medium",
                  dLeft !== null && dLeft < 0
                    ? "border-trails-bad/50 bg-trails-bad/10 text-trails-bad"
                    : dLeft !== null && dLeft <= 14
                      ? "border-trails-warn/50 bg-trails-warn/10 text-trails-warn"
                      : "border-trails-trim/40 text-trails-fg-dim",
                )}
              >
                <CalendarClock className="h-2.5 w-2.5" />
                {dLeft !== null && dLeft < 0 ? `${-dLeft}d over` : dLeft === 0 ? "today" : dLeft !== null && dLeft <= 14 ? `${dLeft}d` : data.deadline}
              </span>
            )}
            {data.stepProgress.total > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-trails-fg-dim">
                <span className="tabular-nums">{data.stepProgress.completed}/{data.stepProgress.total}</span>
                <span className="relative h-1 w-10 overflow-hidden rounded-full bg-trails-bg-deep">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-trails-accent" style={{ width: `${(data.stepProgress.completed / data.stepProgress.total) * 100}%` }} />
                </span>
              </span>
            )}
            {data.prereqCount > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1 py-0 text-[9px]",
                  data.isLocked ? "border-trails-bad/40 text-trails-bad" : "border-trails-trim/40 text-trails-fg-dim",
                )}
                title={`${data.prereqCount} prerequisite(s)`}
              >
                <Lock className="h-2.5 w-2.5" />
                {data.prereqCount}
              </span>
            )}
            {data.available && (
              <span className="rounded-full bg-trails-accent/20 px-1.5 py-0 font-display text-[8px] uppercase tracking-widest text-trails-accent">
                ready
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-trails-trim !bg-trails-bg-deep" />
    </div>
  );
}

function MilestoneTooltip({
  data,
  statusLabel,
  dLeft,
}: {
  data: MilestoneNodeData;
  statusLabel: string;
  dLeft: number | null;
}) {
  const c = data.categoryColor ?? "#6ea8fe";
  return (
    <div className="w-64 rounded-md border-2 bg-[#0a0f1f]/95 p-3 text-left shadow-xl backdrop-blur-sm" style={{ borderColor: c }}>
      <div className="font-display text-[10px] uppercase tracking-widest" style={{ color: c }}>
        {data.epicTitle} · Tier {data.tier}
      </div>
      <div className="text-sm font-bold text-trails-fg">{data.title}</div>

      <div className="mt-2 space-y-0.5 font-mono text-[11px] text-trails-fg">
        <Row label="Status" value={data.isLocked ? `${statusLabel} · 🔒 locked` : statusLabel} />
        {data.startDate && <Row label="Start" value={data.startDate} />}
        {data.deadline && (
          <Row
            label="Deadline"
            value={
              dLeft !== null && dLeft < 0
                ? `${data.deadline} (${-dLeft}d over)`
                : `${data.deadline}${dLeft !== null && dLeft <= 14 && dLeft >= 0 ? ` (${dLeft}d)` : ""}`
            }
          />
        )}
        {data.stepProgress.total > 0 && (
          <Row label="Steps" value={`${data.stepProgress.completed}/${data.stepProgress.total} done`} />
        )}
        {data.skills.length > 0 && <Row label="Skills" value={data.skills.join(", ")} />}
      </div>

      {data.description && (
        <p className="mt-2 border-t border-trails-trim/30 pt-2 text-[11px] italic text-jrpg-gold-bright">
          {data.description}
        </p>
      )}

      <div className="mt-2 space-y-1 border-t border-trails-trim/30 pt-2 text-[10px]">
        {data.lockedBy.length > 0 && (
          <Rel label="🔒 Locked by" items={data.lockedBy} className="text-trails-bad" />
        )}
        <Rel label="Requires" items={data.requires} empty="nothing — a starting milestone" />
        <Rel label="Unlocks" items={data.unlocks} empty="nothing" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-trails-fg-dim">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Rel({ label, items, empty, className }: { label: string; items: string[]; empty?: string; className?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <div>
      <span className={cn("font-display uppercase tracking-widest text-trails-accent", className)}>{label}</span>{" "}
      {items.length === 0 ? (
        <span className="italic text-trails-fg-dim">{empty}</span>
      ) : (
        <span className="text-trails-fg">{items.join(", ")}</span>
      )}
    </div>
  );
}
