"use client";

import { useState } from "react";
import { CalendarPlus, Eye, HelpCircle, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CalendarImportPreviewModal } from "@/components/calendar-import-preview-modal";

/**
 * §5 — Two-way calendar (pragmatic local-only form). The user uploads an
 * .ics file from any external calendar, previews per-VEVENT, and picks
 * which ones to actually keep.
 *
 * Inline tooltips explain what happens to imported events so the user
 * doesn't have to leave the screen to understand the consequences.
 */
export function ExternalCalendarImportCard() {
  const { data: sources, isLoading } =
    trpc.externalCalendar.listSources.useQuery();
  const utils = trpc.useUtils();
  const del = trpc.externalCalendar.deleteSource.useMutation({
    onSuccess: () => utils.externalCalendar.listSources.invalidate(),
  });
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-trails-info" />
        <h2 className="text-sm font-semibold">External calendars</h2>
        <span
          title="Upload an .ics file from Apple Calendar, Google Calendar, Outlook or any other calendar app. After upload you'll see every event with a checkbox so you can pick which ones to keep."
          className="text-trails-info"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-xs text-trails-fg-dim">
        Imports stay <strong>read-only</strong> and local. You can mirror
        them back out via the Export Bundle (toggle "External" on).
      </p>

      <button
        onClick={() => setPreviewOpen(true)}
        title="Pick an .ics file, see every event with a checkbox, import only the ones you want."
        className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
      >
        <Eye className="h-3 w-3" />
        Import &amp; preview .ics
      </button>

      <CalendarImportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {!isLoading && sources && sources.length > 0 && (
        <>
          <h3 className="mt-4 border-t border-trails-trim-soft/40 pt-3 text-xs font-medium uppercase tracking-wide text-trails-fg-dim">
            Sources · {sources.length}
          </h3>
          <ul className="mt-2 space-y-1">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 text-xs"
                title={`Imported ${s.eventCount} event${s.eventCount === 1 ? "" : "s"} from "${s.label}". Click the trash icon to drop the whole source.`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color }}
                  title={`Color used on the Roadmap: ${s.color}`}
                />
                <span className="flex-1 truncate font-medium">{s.label}</span>
                <span className="tabular-nums text-trails-fg-dim">
                  {s.eventCount}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Delete '${s.label}' and all its events?`)) {
                      del.mutate({ id: s.id });
                    }
                  }}
                  className="rounded p-0.5 text-trails-fg-dim hover:bg-zinc-100 hover:text-trails-bad dark:hover:bg-zinc-800"
                  title="Delete this source and every event from it. Cannot be undone."
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
