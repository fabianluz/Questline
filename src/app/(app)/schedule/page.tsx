"use client";

import { useState } from "react";
import { CalendarClock, Clock, Plus, Trash2, Plane } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { CapacityPanel } from "@/components/capacity-panel";

const DOW = ["M", "T", "W", "T", "F", "S", "S"]; // idx0 = Monday
const todayISO = () => new Date().toISOString().slice(0, 10);

function DaysPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (mask: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {DOW.map((d, i) => {
        const on = value[i] === "1";
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              const arr = value.split("");
              arr[i] = on ? "0" : "1";
              onChange(arr.join(""));
            }}
            className={cn(
              "h-7 w-7 rounded-sm border text-[11px] font-display",
              on
                ? "border-trails-accent bg-trails-accent/20 text-trails-accent"
                : "border-trails-trim/50 text-trails-fg-dim",
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

export default function SchedulePage() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const today = todayISO();
  const { data: window } = trpc.schedule.windowFor.useQuery({ date: today });
  const { data: profiles } = trpc.schedule.listProfiles.useQuery();
  const { data: blocks } = trpc.schedule.listBlocks.useQuery();

  const refresh = () => {
    utils.schedule.listProfiles.invalidate();
    utils.schedule.listBlocks.invalidate();
    utils.schedule.windowFor.invalidate();
  };

  // ── Profile form ──
  const [pName, setPName] = useState("");
  const [pStart, setPStart] = useState("08:00");
  const [pEnd, setPEnd] = useState("15:00");
  const [pDays, setPDays] = useState("1111100");
  const [pFrom, setPFrom] = useState("");
  const [pTo, setPTo] = useState("");
  const [pPriority, setPPriority] = useState(10);
  const [pBreakStart, setPBreakStart] = useState("");
  const [pBreakEnd, setPBreakEnd] = useState("");

  const createProfile = trpc.schedule.createProfile.useMutation({
    onSuccess: () => {
      refresh();
      setPName("");
      toast({ title: "Schedule added", variant: "success" });
    },
    onError: (e) => toast({ title: "Couldn't add", description: e.message, variant: "error" }),
  });
  const updateProfile = trpc.schedule.updateProfile.useMutation({ onSuccess: refresh });
  const deleteProfile = trpc.schedule.deleteProfile.useMutation({ onSuccess: refresh });

  // ── Block form ──
  const [bTitle, setBTitle] = useState("");
  const [bKind, setBKind] = useState<"holiday" | "time_off" | "travel" | "focus" | "busy" | "custom">("holiday");
  const [bStart, setBStart] = useState(today);
  const [bEnd, setBEnd] = useState(today);
  const [bBlocks, setBBlocks] = useState(true);

  const createBlock = trpc.schedule.createBlock.useMutation({
    onSuccess: () => {
      refresh();
      setBTitle("");
      toast({ title: "Block added", variant: "success" });
    },
    onError: (e) => toast({ title: "Couldn't add", description: e.message, variant: "error" }),
  });
  const deleteBlock = trpc.schedule.deleteBlock.useMutation({ onSuccess: refresh });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-trails-accent" />
          Schedule
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-trails-fg-dim">
          Define your working hours over date ranges (e.g. summer vs regular) and
          block out holidays. The planner, calendar feed, and the Guide all
          respect this. 100% local.
        </p>
      </header>

      {/* Today banner */}
      <section className="jrpg-panel flex flex-wrap items-center gap-3 p-4">
        <Clock className="h-4 w-4 text-jrpg-gold" />
        <span className="font-display text-[11px] uppercase tracking-widest text-trails-fg-dim">
          Today ({today})
        </span>
        {window ? (
          window.working ? (
            <span className="font-mono text-sm text-trails-good">
              working {window.start}–{window.end}
              {window.breakStart && window.breakEnd
                ? ` (break ${window.breakStart}–${window.breakEnd})`
                : ""}
              {window.label ? ` · ${window.label}` : ""}
            </span>
          ) : (
            <span className="font-mono text-sm text-trails-bad">
              no work{window.label ? ` · ${window.label}` : ""}
            </span>
          )
        ) : (
          <span className="text-sm text-trails-fg-dim">…</span>
        )}
      </section>

      {/* Capacity meter */}
      <CapacityPanel />

      {/* Schedule profiles */}
      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Work schedules
        </h2>

        <div className="space-y-2">
          {(profiles ?? []).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-trails-trim/40 p-3"
            >
              <div className="min-w-0">
                <p className="font-display text-[13px] text-trails-fg">
                  {p.name}{" "}
                  <span className="font-mono text-xs text-trails-fg-dim">
                    {p.startTime}–{p.endTime}
                    {p.breakStart && p.breakEnd ? ` · lunch ${p.breakStart}–${p.breakEnd}` : ""}
                  </span>
                </p>
                <p className="text-[11px] text-trails-fg-dim">
                  {DOW.map((d, i) => (p.days[i] === "1" ? d : "·")).join("")} ·{" "}
                  {p.effectiveFrom || p.effectiveTo
                    ? `${p.effectiveFrom ?? "…"} → ${p.effectiveTo ?? "…"}`
                    : "always"}{" "}
                  · priority {p.priority}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.active}
                  title={p.active ? "Active" : "Inactive"}
                  onClick={() => updateProfile.mutate({ id: p.id, patch: { active: !p.active } })}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full border transition",
                    p.active ? "border-trails-good bg-trails-good/30" : "border-trails-trim/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full transition",
                      p.active ? "translate-x-4 bg-trails-good" : "translate-x-0.5 bg-trails-fg-dim",
                    )}
                  />
                </button>
                <button
                  onClick={() => deleteProfile.mutate({ id: p.id })}
                  className="text-trails-fg-dim hover:text-trails-bad"
                  aria-label="Delete schedule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {(profiles ?? []).length === 0 && (
            <p className="text-xs text-trails-fg-dim">
              No schedules yet — your single work window is used until you add one.
            </p>
          )}
        </div>

        {/* New profile */}
        <div className="mt-3 grid gap-2 rounded-md border border-dashed border-trails-trim/50 p-3 sm:grid-cols-2">
          <input
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            placeholder="Name (e.g. Summer Hours)"
            className="rounded-md border border-trails-trim/50 bg-trails-panel-dark px-2 py-1 text-sm sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            Hours
            <input type="time" value={pStart} onChange={(e) => setPStart(e.target.value)} className="rounded-md px-2 py-1 text-xs tabular-nums" />
            <input type="time" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="rounded-md px-2 py-1 text-xs tabular-nums" />
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim" title="Optional mid-day break (e.g. lunch). Carved out of the work window.">
            Break
            <input type="time" value={pBreakStart} onChange={(e) => setPBreakStart(e.target.value)} className="rounded-md px-2 py-1 text-xs tabular-nums" />
            <input type="time" value={pBreakEnd} onChange={(e) => setPBreakEnd(e.target.value)} className="rounded-md px-2 py-1 text-xs tabular-nums" />
          </label>
          <div className="flex items-center gap-2"><span className="text-xs text-trails-fg-dim">Days</span><DaysPicker value={pDays} onChange={setPDays} /></div>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            From
            <input type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} className="rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            To
            <input type="date" value={pTo} onChange={(e) => setPTo(e.target.value)} className="rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            Priority
            <input type="number" min={0} max={1000} value={pPriority} onChange={(e) => setPPriority(Number(e.target.value) || 0)} className="w-20 rounded-md px-2 py-1 text-xs tabular-nums" />
          </label>
          <button
            onClick={() =>
              createProfile.mutate({
                name: pName.trim(),
                startTime: pStart,
                endTime: pEnd,
                breakStart: pBreakStart || null,
                breakEnd: pBreakEnd || null,
                days: pDays,
                effectiveFrom: pFrom || null,
                effectiveTo: pTo || null,
                priority: pPriority,
                active: true,
              })
            }
            disabled={!pName.trim() || createProfile.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 text-sm text-trails-accent disabled:opacity-50 sm:col-span-2"
          >
            <Plus className="h-4 w-4" /> Add schedule
          </button>
        </div>
      </section>

      {/* Calendar blocks */}
      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Holidays & time off
        </h2>

        <div className="space-y-2">
          {(blocks ?? []).map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-trails-trim/40 p-3"
            >
              <div className="min-w-0">
                <p className="font-display text-[13px] text-trails-fg">
                  <Plane className="mr-1 inline h-3.5 w-3.5 text-jrpg-gold" />
                  {b.title}{" "}
                  {b.blocksWork && (
                    <span className="rounded-sm border border-trails-bad/50 px-1 text-[9px] uppercase text-trails-bad">
                      no work
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-trails-fg-dim">
                  {b.kind} · {b.startDate} → {b.endDate}
                </p>
              </div>
              <button
                onClick={() => deleteBlock.mutate({ id: b.id })}
                className="text-trails-fg-dim hover:text-trails-bad"
                aria-label="Delete block"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(blocks ?? []).length === 0 && (
            <p className="text-xs text-trails-fg-dim">No holidays or time off added.</p>
          )}
        </div>

        {/* New block */}
        <div className="mt-3 grid gap-2 rounded-md border border-dashed border-trails-trim/50 p-3 sm:grid-cols-2">
          <input
            value={bTitle}
            onChange={(e) => setBTitle(e.target.value)}
            placeholder="Title (e.g. Japan trip)"
            className="rounded-md border border-trails-trim/50 bg-trails-panel-dark px-2 py-1 text-sm sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            Kind
            <select value={bKind} onChange={(e) => setBKind(e.target.value as typeof bKind)} className="rounded-md px-2 py-1 text-xs">
              <option value="holiday">holiday</option>
              <option value="time_off">time_off</option>
              <option value="travel">travel</option>
              <option value="focus">focus</option>
              <option value="busy">busy</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            <input type="checkbox" checked={bBlocks} onChange={(e) => setBBlocks(e.target.checked)} />
            Blocks work
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            From
            <input type="date" value={bStart} onChange={(e) => setBStart(e.target.value)} className="rounded-md px-2 py-1 text-xs" />
          </label>
          <label className="flex items-center gap-2 text-xs text-trails-fg-dim">
            To
            <input type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} className="rounded-md px-2 py-1 text-xs" />
          </label>
          <button
            onClick={() =>
              createBlock.mutate({
                title: bTitle.trim(),
                kind: bKind,
                startDate: bStart,
                endDate: bEnd < bStart ? bStart : bEnd,
                allDay: true,
                blocksWork: bBlocks,
              })
            }
            disabled={!bTitle.trim() || createBlock.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 text-sm text-trails-accent disabled:opacity-50 sm:col-span-2"
          >
            <Plus className="h-4 w-4" /> Add block
          </button>
        </div>
      </section>
    </div>
  );
}
