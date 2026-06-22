"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * §5 — Calendar export bundle modal.
 *
 * Lets the user assemble a one-shot .ics download containing exactly the
 * events they want. Tree of:
 *   ├── Milestones        (toggle + per-event)
 *   ├── Steps             (toggle only — auto-scheduled)
 *   ├── Daily Quests      (toggle + per-event)
 *   ├── Side Quests       (toggle + per-event)
 *   ├── Bills             (toggle + per-event)
 *   └── External imports  (toggle + per-event)
 *
 * Each per-event row is a checkbox. Default state for each kind: all
 * checked. Unchecking the parent toggle skips that whole kind regardless
 * of its per-event state.
 */
export function CalendarExportBundleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Pull all candidates in parallel. Cheap — same data already cached.
  const tree = trpc.tree.get.useQuery(undefined, { enabled: open });
  const quests = trpc.quest.list.useQuery(undefined, { enabled: open });
  const billsQuery = trpc.inventory.bills.list.useQuery(undefined, {
    enabled: open,
  });
  const externalEvts = trpc.externalCalendar.listEvents.useQuery(
    {
      fromISO: new Date(Date.now() - 30 * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
      toISO: new Date(Date.now() + 180 * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
    },
    { enabled: open },
  );

  // Kind toggles
  const [enabled, setEnabled] = useState({
    milestones: true,
    steps: false,
    quests: true,
    sideQuests: true,
    bills: true,
    external: false,
  });

  // Per-event picks (empty = include all by default)
  const [skipIds, setSkipIds] = useState<Record<string, Set<string>>>({
    milestoneIds: new Set(),
    questIds: new Set(),
    billIds: new Set(),
    externalEventIds: new Set(),
  });

  const [building, setBuilding] = useState(false);
  const [eventCount, setEventCount] = useState<number | null>(null);

  // Reset state when reopened.
  useEffect(() => {
    if (open) {
      setEventCount(null);
      setSkipIds({
        milestoneIds: new Set(),
        questIds: new Set(),
        billIds: new Set(),
        externalEventIds: new Set(),
      });
    }
  }, [open]);

  function toggleId(kind: keyof typeof skipIds, id: string) {
    setSkipIds((s) => {
      const next = { ...s };
      const set = new Set(next[kind]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      next[kind] = set;
      return next;
    });
  }

  const milestonesWithDates = useMemo(
    () =>
      (tree.data?.milestones ?? []).filter(
        (m) => m.estimatedAchievementDate,
      ),
    [tree.data],
  );
  const dailyQuests = (quests.data ?? []).filter(
    (q) => q.cadence === "daily" || q.cadence === "weekly",
  );
  const sideQuests = (quests.data ?? []).filter(
    (q) => q.cadence === "one_off",
  );
  const bills = (billsQuery.data ?? []).filter((b) => b.nextDueDate);
  const extEvents = externalEvts.data ?? [];

  async function download() {
    setBuilding(true);
    setEventCount(null);
    try {
      // Build the include list as the complement of what's checked-off.
      // Empty array = "include all of this kind".
      const include = {
        milestoneIds: milestonesWithDates
          .filter((m) => !skipIds.milestoneIds.has(m.id))
          .map((m) => m.id),
        questIds: [...dailyQuests, ...sideQuests]
          .filter((q) => !skipIds.questIds.has(q.id))
          .map((q) => q.id),
        billIds: bills
          .filter((b) => !skipIds.billIds.has(b.id))
          .map((b) => b.id),
        externalEventIds: extEvents
          .filter((e) => !skipIds.externalEventIds.has(e.id))
          .map((e) => e.id),
      };
      // If user kept "all" for a kind, send empty array (server treats as "all").
      const equalsAll = (a: string[], b: { id: string }[]) =>
        a.length === b.length;
      const manifest = {
        enabled,
        include: {
          milestoneIds: equalsAll(include.milestoneIds, milestonesWithDates)
            ? []
            : include.milestoneIds,
          questIds: equalsAll(include.questIds, [
            ...dailyQuests,
            ...sideQuests,
          ])
            ? []
            : include.questIds,
          billIds: equalsAll(include.billIds, bills) ? [] : include.billIds,
          externalEventIds: equalsAll(include.externalEventIds, extEvents)
            ? []
            : include.externalEventIds,
        },
      };
      const res = await fetch("/api/calendar/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
      });
      if (!res.ok) {
        alert(`Export failed: HTTP ${res.status}`);
        return;
      }
      const count = Number(res.headers.get("X-Event-Count") ?? "0");
      setEventCount(count);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questline-${new Date().toISOString().slice(0, 10)}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBuilding(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="jrpg-panel relative w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
            ⚔ Export Calendar Bundle
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 text-sm">
          <KindGroup
            label="Milestones with target dates"
            enabled={enabled.milestones}
            onToggle={(v) => setEnabled({ ...enabled, milestones: v })}
            items={milestonesWithDates.map((m) => ({
              id: m.id,
              label: m.title,
              hint: m.estimatedAchievementDate ?? "",
            }))}
            skipped={skipIds.milestoneIds}
            onItemToggle={(id) => toggleId("milestoneIds", id)}
          />

          <SimpleToggle
            label="Steps (auto-scheduled into your work window)"
            checked={enabled.steps}
            onChange={(v) => setEnabled({ ...enabled, steps: v })}
            hint="Pulls every incomplete Step and slots it into the next available work-window slot."
          />

          <KindGroup
            label="Daily / Weekly Quests"
            enabled={enabled.quests}
            onToggle={(v) => setEnabled({ ...enabled, quests: v })}
            items={dailyQuests.map((q) => ({
              id: q.id,
              label: q.title,
              hint: q.cadence,
            }))}
            skipped={skipIds.questIds}
            onItemToggle={(id) => toggleId("questIds", id)}
          />

          <KindGroup
            label="Side Quests (one-off)"
            enabled={enabled.sideQuests}
            onToggle={(v) => setEnabled({ ...enabled, sideQuests: v })}
            items={sideQuests.map((q) => ({
              id: q.id,
              label: q.title,
              hint: q.difficulty ?? "",
            }))}
            skipped={skipIds.questIds}
            onItemToggle={(id) => toggleId("questIds", id)}
          />

          <KindGroup
            label="Recurring Bills"
            enabled={enabled.bills}
            onToggle={(v) => setEnabled({ ...enabled, bills: v })}
            items={bills.map((b) => ({
              id: b.id,
              label: b.name,
              hint: b.nextDueDate ?? "",
            }))}
            skipped={skipIds.billIds}
            onItemToggle={(id) => toggleId("billIds", id)}
          />

          <KindGroup
            label="External calendar imports (mirror back out)"
            enabled={enabled.external}
            onToggle={(v) => setEnabled({ ...enabled, external: v })}
            items={extEvents.map((e) => ({
              id: e.id,
              label: e.summary,
              hint: e.startsAt
                ? new Date(e.startsAt).toISOString().slice(0, 10)
                : "",
            }))}
            skipped={skipIds.externalEventIds}
            onItemToggle={(id) => toggleId("externalEventIds", id)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-jrpg-gold/40 p-4">
          {eventCount !== null && (
            <span className="inline-flex items-center gap-1 font-pixel text-[10px] text-jrpg-emerald">
              <Check className="h-3 w-3" /> {eventCount} events exported
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="jrpg-btn jrpg-btn--ghost"
              disabled={building}
            >
              Close
            </button>
            <button
              onClick={download}
              disabled={building}
              className="jrpg-btn inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" />
              {building ? "Building..." : "Download .ics"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleToggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-jrpg-gold/40 p-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="font-pixel text-[11px] uppercase text-jrpg-gold-bright">
          {label}
        </span>
      </label>
      {hint && <p className="mt-1 text-xs text-jrpg-muted">{hint}</p>}
    </div>
  );
}

function KindGroup({
  label,
  enabled,
  onToggle,
  items,
  skipped,
  onItemToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  items: { id: string; label: string; hint?: string }[];
  skipped: Set<string>;
  onItemToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-jrpg-gold/40 p-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="font-pixel text-[11px] uppercase text-jrpg-gold-bright">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-jrpg-muted">
          {items.length === 0 ? "(none)" : `${items.length - skipped.size}/${items.length}`}
        </span>
      </label>

      {enabled && items.length > 0 && (
        <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto border-t border-jrpg-gold/20 pt-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={!skipped.has(it.id)}
                onChange={() => onItemToggle(it.id)}
              />
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && (
                <span className="tabular-nums text-[10px] text-jrpg-muted">
                  {it.hint}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
