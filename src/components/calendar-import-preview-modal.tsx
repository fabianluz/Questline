"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { parseIcs, type ParsedEvent } from "@/lib/ics-parser";

/**
 * §5 — Calendar import preview modal.
 *
 * 1. User picks an .ics file → parse client-side via shared `parseIcs`
 * 2. Show a list of every VEVENT with checkboxes (all selected by default)
 * 3. On confirm: re-serialise only the selected events into a synthetic
 *    .ics string and call `externalCalendar.importIcs` with that.
 *
 * Parsing client-side lets us preview without a round-trip and keeps the
 * server-side `importIcs` happy: it expects an .ics body, not a JSON list.
 */
export function CalendarImportPreviewModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const utils = trpc.useUtils();
  const importIcs = trpc.externalCalendar.importIcs.useMutation({
    onSuccess: () => {
      utils.externalCalendar.listSources.invalidate();
      onImported?.();
    },
  });

  const [label, setLabel] = useState("Imported calendar");
  const [color, setColor] = useState("#5b2a86");
  const [rawIcs, setRawIcs] = useState<string>("");
  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);

  // Hold a ref to `importIcs.reset` so we can call it from the close-cleanup
  // effect WITHOUT depending on the whole mutation object — that object is
  // a fresh reference on every render (it's the return of useMutation), so
  // depending on it would re-run the effect → re-render → new ref → re-run
  // → "Maximum update depth exceeded" infinite loop. The ref pattern keeps
  // the latest reset callable without participating in the dep array.
  const resetMutationRef = useRef(importIcs.reset);
  resetMutationRef.current = importIcs.reset;

  useEffect(() => {
    if (!open) {
      setRawIcs("");
      setEvents([]);
      setSkipped(new Set());
      setParseError(null);
      resetMutationRef.current();
    }
  }, [open]);

  async function onFile(file: File) {
    setParseError(null);
    try {
      const text = await file.text();
      const parsed = parseIcs(text);
      if (parsed.length === 0) {
        setParseError("No VEVENT blocks found in this file.");
        return;
      }
      setRawIcs(text);
      setEvents(parsed);
      setSkipped(new Set());
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggle(uid: string) {
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const selected = useMemo(
    () => events.filter((e) => !skipped.has(e.uid)),
    [events, skipped],
  );

  function confirmImport() {
    if (selected.length === 0) return;
    // Re-emit only the selected events as a minimal .ics. We use the original
    // raw text to keep any non-essential headers the user might rely on.
    // Filter VEVENT blocks by UID.
    const selectedUids = new Set(selected.map((e) => e.uid));
    const lines = rawIcs.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const out: string[] = [];
    let buffer: string[] = [];
    let inEvent = false;
    let currentUid: string | null = null;
    for (const line of lines) {
      if (line.trim() === "BEGIN:VEVENT") {
        inEvent = true;
        buffer = [line];
        currentUid = null;
        continue;
      }
      if (line.trim() === "END:VEVENT") {
        buffer.push(line);
        if (currentUid && selectedUids.has(currentUid)) {
          out.push(...buffer);
        }
        inEvent = false;
        buffer = [];
        continue;
      }
      if (inEvent) {
        buffer.push(line);
        const m = line.match(/^UID:(.*)$/);
        if (m) currentUid = m[1].trim();
      } else {
        out.push(line);
      }
    }
    const filteredIcs = out.join("\r\n");
    importIcs.mutate({ label, color, content: filteredIcs });
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
            ⚔ Import Calendar
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label"
              className="col-span-2 rounded-md border border-jrpg-gold/40 px-2 py-1"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 rounded-md border border-jrpg-gold/40"
            />
          </div>

          <input
            type="file"
            accept=".ics,text/calendar"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block w-full text-xs"
          />

          {parseError && (
            <p className="rounded-md border border-jrpg-crimson/50 bg-jrpg-crimson/15 p-2 text-xs text-jrpg-crimson">
              {parseError}
            </p>
          )}

          {events.length > 0 && (
            <div className="rounded-md border border-jrpg-gold/40 p-2">
              <div className="flex items-center justify-between border-b border-jrpg-gold/30 px-1 pb-1 font-pixel text-[10px] uppercase text-jrpg-gold-bright">
                <span>
                  {selected.length}/{events.length} selected
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSkipped(new Set())}
                    className="hover:text-jrpg-gold"
                  >
                    All
                  </button>
                  <span className="opacity-50">·</span>
                  <button
                    onClick={() =>
                      setSkipped(new Set(events.map((e) => e.uid)))
                    }
                    className="hover:text-jrpg-gold"
                  >
                    None
                  </button>
                </div>
              </div>
              <ul className="max-h-72 space-y-0.5 overflow-y-auto p-1 text-xs">
                {events.map((e) => (
                  <li
                    key={e.uid}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={!skipped.has(e.uid)}
                      onChange={() => toggle(e.uid)}
                    />
                    <span className="flex-1 truncate">{e.summary}</span>
                    <span className="tabular-nums text-[10px] text-jrpg-muted">
                      {e.startsAt.toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importIcs.data && (
            <p className="inline-flex items-center gap-1 font-pixel text-[10px] text-jrpg-emerald">
              <Check className="h-3 w-3" />
              Imported {importIcs.data.eventCount} event
              {importIcs.data.eventCount === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-4">
          <button onClick={onClose} className="jrpg-btn jrpg-btn--ghost">
            Close
          </button>
          <button
            onClick={confirmImport}
            disabled={
              selected.length === 0 ||
              importIcs.isPending ||
              !!importIcs.data
            }
            className="jrpg-btn inline-flex items-center gap-1"
          >
            <Upload className="h-3 w-3" />
            {importIcs.isPending
              ? "Importing..."
              : `Import ${selected.length} event${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
