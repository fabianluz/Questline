"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Download,
  NotebookPen,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import type { DayPlanBlock } from "@/server/db/schema/journal";

const PX_PER_HOUR = 44;
const KIND_COLOR: Record<string, string> = {
  work: "#4a90e2",
  break: "#7ed321",
  fixed: "#9013fe",
  flex: "#f5a623",
  sleep: "#6b7280",
  quest: "#f59e0b",
  step: "#22d3ee",
  event: "#ec4899",
  suggestion: "#a78bfa",
  manual: "#94a3b8",
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `b-${Math.random().toString(36).slice(2)}`;

/** Open an .ics in Apple Calendar (desktop) or download it (web). */
async function takeToCalendar(ics: string, filename: string) {
  const bridge = (window as unknown as { questline?: { openIcs?: (ics: string, f: string) => Promise<unknown> } }).questline;
  if (bridge?.openIcs) {
    await bridge.openIcs(ics, filename);
    return;
  }
  downloadIcs(ics, filename);
}
function downloadIcs(ics: string, filename: string) {
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JournalPage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const [date, setDate] = useState(todayISO());
  const [blocks, setBlocks] = useState<DayPlanBlock[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  const { data, isLoading } = trpc.journal.get.useQuery({ date });
  const { data: win } = trpc.schedule.windowFor.useQuery({ date });

  useEffect(() => {
    setBlocks((data?.plan?.blocks as DayPlanBlock[]) ?? []);
  }, [data?.plan?.blocks, date]);

  const save = trpc.journal.save.useMutation({
    onSuccess: () => utils.journal.get.invalidate({ date }),
  });
  const plan = trpc.journal.plan.useMutation({
    onSuccess: (p) => {
      setBlocks((p.blocks as DayPlanBlock[]) ?? []);
      utils.journal.get.invalidate({ date });
      toast({ title: "Day planned", description: `${p.blocks.length} blocks`, variant: "success" });
    },
    onError: (e) => toast({ title: "Planner failed", description: e.message, variant: "error" }),
  });
  const generate = trpc.journal.generate.useMutation({
    onSuccess: (p) => {
      setBlocks((p.blocks as DayPlanBlock[]) ?? []);
      utils.journal.get.invalidate({ date });
      toast({ title: "Optimized with AI", description: `${p.blocks.length} blocks`, variant: "success" });
    },
    onError: (e) => toast({ title: "AI optimize failed", description: e.message, variant: "error" }),
  });

  async function copyYesterday() {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const res = await utils.journal.get.fetch({ date: prev });
    const prevBlocks = (res?.plan?.blocks as DayPlanBlock[]) ?? [];
    if (prevBlocks.length === 0) {
      toast({ title: "Nothing to copy", description: `No plan on ${prev}`, variant: "error" });
      return;
    }
    const cloned = prevBlocks.map((b) => ({ ...b, id: uid(), done: false }));
    persist(cloned);
    toast({ title: "Copied yesterday", description: `${cloned.length} blocks`, variant: "success" });
  }
  const generateJournal = trpc.journal.generateJournal.useMutation({
    onSuccess: () => {
      utils.journal.get.invalidate({ date });
      setJournalOpen(true);
    },
    onError: (e) => toast({ title: "Journal failed", description: e.message, variant: "error" }),
  });

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start)),
    [blocks],
  );

  function persist(next: DayPlanBlock[]) {
    setBlocks(next);
    save.mutate({ date, blocks: next });
  }
  const updateBlock = (id: string, patch: Partial<DayPlanBlock>) =>
    persist(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBlock = (id: string) => persist(blocks.filter((b) => b.id !== id));
  const addBlock = () =>
    persist([
      ...blocks,
      { id: uid(), start: "12:00", end: "13:00", title: "New block", kind: "flex", source: "manual" },
    ]);

  async function exportIcs(open: boolean) {
    const res = await utils.journal.toIcs.fetch({ date });
    if (open) await takeToCalendar(res.ics, res.filename);
    else downloadIcs(res.ics, res.filename);
    toast({ title: open ? "Sent to Calendar" : "Downloaded .ics", variant: "success" });
  }

  const isToday = date === todayISO();
  const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-trails-accent" />
            Daily Journal
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Lay your quests, steps and fixed blocks onto a 00–24 timeline, then
            reflect and push it to your calendar.
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value || todayISO())}
          className="rounded-md px-3 py-1.5 text-sm tabular-nums"
        />
      </header>

      {/* Schedule banner — the single source of truth for the work window */}
      <div className="jrpg-panel flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <Clock className="h-4 w-4 text-jrpg-gold" />
        {win ? (
          win.working ? (
            <span className="text-trails-fg-dim">
              Working{" "}
              <span className="font-mono text-trails-good">
                {win.start}–{win.end}
              </span>
              {win.breakStart && win.breakEnd ? (
                <span className="font-mono text-trails-fg-dim">
                  {" "}
                  (break {win.breakStart}–{win.breakEnd})
                </span>
              ) : null}
              {win.label ? <span> · {win.label}</span> : null}
            </span>
          ) : (
            <span className="font-mono text-trails-bad">
              No work{win.label ? ` · ${win.label}` : ""}
            </span>
          )
        ) : (
          <span className="text-trails-fg-dim">…</span>
        )}
        <a href="/schedule" className="ml-auto text-xs text-trails-accent hover:underline">
          Edit schedule →
        </a>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => plan.mutate({ date })}
          disabled={plan.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/15 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/25 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {plan.isPending ? "Planning…" : data?.plan ? "Re-plan day" : "Plan day"}
        </button>
        <button
          onClick={() => generate.mutate({ date })}
          disabled={generate.isPending}
          title="Let the local AI rearrange the same blocks (slower; optional)"
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {generate.isPending ? "Optimizing…" : "Optimize (AI)"}
        </button>
        <button
          onClick={copyYesterday}
          title="Clone yesterday's plan onto today"
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent"
        >
          <Copy className="h-3.5 w-3.5" /> Copy yesterday
        </button>
        <button
          onClick={addBlock}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Add block
        </button>
        <button
          onClick={() => generateJournal.mutate({ date })}
          disabled={generateJournal.isPending || blocks.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent disabled:opacity-50"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          {generateJournal.isPending ? "Writing…" : "Generate Journal"}
        </button>
        <button
          onClick={() => exportIcs(false)}
          disabled={blocks.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Export .ics
        </button>
        <button
          onClick={() => exportIcs(true)}
          disabled={blocks.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg hover:text-trails-accent disabled:opacity-50"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Take to Calendar
        </button>
        <button
          onClick={() => setShowManage((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-3 py-1.5 text-xs text-trails-fg-dim hover:text-trails-accent"
        >
          <Settings2 className="h-3.5 w-3.5" /> Day blocks
        </button>
      </div>

      {showManage && <ManageTemplates onClose={() => setShowManage(false)} />}

      {!data?.hasTemplates && !isLoading && (
        <SeedPrompt onSeeded={() => utils.journal.get.invalidate({ date })} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div className="jrpg-panel overflow-hidden p-0">
          <div className="relative" style={{ height: 24 * PX_PER_HOUR }}>
            {Array.from({ length: 25 }).map((_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-trails-trim/15"
                style={{ top: h * PX_PER_HOUR }}
              >
                <span className="absolute -top-2 left-1 font-mono text-[10px] text-trails-fg-dim">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
            {nowMin >= 0 && (
              <div
                className="pointer-events-none absolute left-12 right-0 z-20 h-px bg-trails-bad"
                style={{ top: (nowMin / 60) * PX_PER_HOUR }}
              >
                <span className="absolute -left-11 -top-1.5 rounded-sm bg-trails-bad px-1 font-display text-[8px] font-bold uppercase text-trails-bg-deep">
                  Now
                </span>
              </div>
            )}
            {sorted.map((b) => {
              const top = (toMin(b.start) / 60) * PX_PER_HOUR;
              const height = Math.max(
                16,
                ((toMin(b.end) - toMin(b.start)) / 60) * PX_PER_HOUR - 2,
              );
              const color = b.color || KIND_COLOR[b.kind] || KIND_COLOR.manual;
              return (
                <div
                  key={b.id}
                  className="absolute left-12 right-2 overflow-hidden rounded-sm px-2 py-0.5 text-xs shadow-sm"
                  style={{
                    top,
                    height,
                    background: `${color}22`,
                    borderLeft: `3px solid ${color}`,
                  }}
                  title={`${b.start}–${b.end} · ${b.title}`}
                >
                  <button
                    onClick={() => updateBlock(b.id, { done: !b.done })}
                    title={b.done ? "Mark not done" : "Mark done"}
                    className="mr-1 align-middle"
                  >
                    {b.done ? (
                      <Check className="inline h-3 w-3 text-trails-good" />
                    ) : (
                      <Clock className="inline h-3 w-3 text-trails-fg-dim" />
                    )}
                  </button>
                  <span className={cn("font-medium text-trails-fg", b.done && "line-through opacity-70")}>
                    {b.title}
                  </span>
                  <span className="ml-1 font-mono text-[10px] text-trails-fg-dim">
                    {b.start}–{b.end}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="space-y-2">
          <h2 className="!m-0 !border-0 !p-0 font-display text-xs uppercase tracking-widest text-trails-accent">
            Blocks · {sorted.length}
          </h2>
          {sorted.length === 0 && (
            <p className="text-xs text-trails-fg-dim">
              Generate a plan, or add blocks manually. Edit times here to move
              them.
            </p>
          )}
          <ul className="space-y-1.5">
            {sorted.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-1.5 rounded-md border border-trails-trim/30 bg-trails-panel-dark/40 px-2 py-1.5"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: KIND_COLOR[b.kind] || KIND_COLOR.manual }}
                  title={b.kind}
                />
                <input
                  type="time"
                  value={b.start}
                  onChange={(e) => updateBlock(b.id, { start: e.target.value })}
                  className="w-[5.5rem] rounded bg-transparent px-1 text-[11px] tabular-nums"
                />
                <input
                  type="time"
                  value={b.end}
                  onChange={(e) => updateBlock(b.id, { end: e.target.value })}
                  className="w-[5.5rem] rounded bg-transparent px-1 text-[11px] tabular-nums"
                />
                <input
                  type="text"
                  value={b.title}
                  onChange={(e) => updateBlock(b.id, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded bg-transparent px-1 text-xs text-trails-fg"
                />
                <button
                  onClick={() => removeBlock(b.id)}
                  aria-label="Delete block"
                  className="shrink-0 rounded p-0.5 text-trails-fg-dim hover:text-trails-bad"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {journalOpen && data?.plan?.journalText && (
        <JournalModal
          text={data.plan.journalText}
          date={date}
          onClose={() => setJournalOpen(false)}
        />
      )}
    </div>
  );
}

function SeedPrompt({ onSeeded }: { onSeeded: () => void }) {
  const seed = trpc.journal.templates.seedFromWorkWindow.useMutation({
    onSuccess: onSeeded,
  });
  return (
    <div className="rounded-lg border border-dashed border-trails-accent/50 bg-trails-accent/5 p-4 text-sm">
      <p className="text-trails-fg-dim">
        Your <strong>work hours come from your Schedule</strong> automatically —
        just hit <strong>Plan day</strong>. Day-blocks are <em>optional</em> fixed
        anchors (sleep, gym, treatments) the planner works around. Seed starters
        from your work-window, or add your own under <strong>Day blocks</strong>.
      </p>
      <button
        onClick={() => seed.mutate()}
        disabled={seed.isPending}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
      >
        {seed.isPending ? "Setting up…" : "Seed starter anchors"}
      </button>
    </div>
  );
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function ManageTemplates({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: templates } = trpc.journal.templates.list.useQuery();
  const upsert = trpc.journal.templates.upsert.useMutation({
    onSuccess: () => utils.journal.templates.list.invalidate(),
  });
  const del = trpc.journal.templates.delete.useMutation({
    onSuccess: () => utils.journal.templates.list.invalidate(),
  });
  const [draft, setDraft] = useState({
    label: "",
    kind: "fixed" as "work" | "break" | "fixed" | "flex" | "sleep",
    startHHMM: "09:00",
    endHHMM: "10:00",
    daysMask: "1111100",
  });

  function toggleDay(i: number) {
    const arr = draft.daysMask.split("");
    arr[i] = arr[i] === "1" ? "0" : "1";
    setDraft({ ...draft, daysMask: arr.join("") });
  }

  return (
    <div className="rounded-lg border border-trails-trim/40 bg-trails-panel-dark/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="!m-0 !border-0 !p-0 font-display text-xs uppercase tracking-widest text-trails-accent">
          Recurring day-blocks
        </h2>
        <button onClick={onClose} aria-label="Close" className="text-trails-fg-dim hover:text-trails-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mb-3 space-y-1">
        {(templates ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-trails-fg">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[t.kind] }} />
            <span className="font-medium">{t.label}</span>
            <span className="font-mono text-trails-fg-dim">
              {t.startHHMM}–{t.endHHMM}
            </span>
            <span className="font-mono text-[10px] text-trails-fg-dim">
              {t.daysMask.split("").map((c, i) => (c === "1" ? DAYS[i] : "·")).join("")}
            </span>
            <button
              onClick={() => del.mutate({ id: t.id })}
              className="ml-auto rounded p-0.5 text-trails-fg-dim hover:text-trails-bad"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input
          type="text"
          placeholder="Label (e.g. Gym)"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="w-32 rounded-md px-2 py-1 text-xs"
        />
        <select
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as typeof draft.kind })}
          className="rounded-md px-2 py-1 text-xs"
        >
          {["work", "break", "fixed", "flex", "sleep"].map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input type="time" value={draft.startHHMM} onChange={(e) => setDraft({ ...draft, startHHMM: e.target.value })} className="rounded-md px-2 py-1 text-xs tabular-nums" />
        <input type="time" value={draft.endHHMM} onChange={(e) => setDraft({ ...draft, endHHMM: e.target.value })} className="rounded-md px-2 py-1 text-xs tabular-nums" />
        <div className="flex gap-0.5">
          {DAYS.map((d, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={cn(
                "h-6 w-6 rounded text-[10px] font-bold",
                draft.daysMask.charAt(i) === "1"
                  ? "bg-trails-accent/30 text-trails-accent"
                  : "bg-trails-bg-deep/60 text-trails-fg-dim",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (!draft.label.trim()) return;
            upsert.mutate(draft);
            setDraft({ ...draft, label: "" });
          }}
          disabled={upsert.isPending || !draft.label.trim()}
          className="rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1 text-xs font-medium text-trails-accent disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function JournalModal({
  text,
  date,
  onClose,
}: {
  text: string;
  date: string;
  onClose: () => void;
}) {
  const toast = useToast();
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onClick={onClose}>
      <div className="jrpg-panel w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 px-4 py-2">
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Daily Journal — {date}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text);
                toast({ title: "Copied to clipboard", variant: "success" });
              }}
              className="inline-flex items-center gap-1 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2 py-1 text-[10px] uppercase tracking-widest text-trails-accent"
            >
              <Copy className="h-3 w-3" /> Copy for Obsidian
            </button>
            <button onClick={onClose} aria-label="Close" className="text-trails-fg-dim hover:text-trails-fg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-sm text-trails-fg">
          {text}
        </pre>
      </div>
    </div>
  );
}
