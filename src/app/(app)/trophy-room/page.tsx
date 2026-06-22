"use client";

import { useState } from "react";
import { Download, HelpCircle, Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { JsonExportDialog } from "@/components/json-export-dialog";

/**
 * §6 — Trophy Room. Permanent gallery of completed Epics. Each Epic gets a
 * deterministic SVG sigil generated from its id + title (so the same Epic
 * always renders the same artifact).
 *
 * Trails palette: pedestal panels use the existing cascading rule (royal
 * blue with cyan trim), and we add a gold accent ring around each sigil
 * pedestal for the "this trophy is forever" feel.
 */
export default function TrophyRoomPage() {
  const { data: trophies, isLoading } = trpc.wellbeing.listTrophies.useQuery();
  const [exportOpen, setExportOpen] = useState(false);
  const exportQuery = trpc.dataio.exportTrophies.useQuery(undefined, {
    enabled: exportOpen,
  });

  const hasTrophies = !!trophies && trophies.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-trails-accent" />
            Trophy Room
            <span
              title="Permanent gallery of every Epic you've completed. Each Epic gets a unique SVG sigil generated deterministically from its id + title — the same Epic always renders the same artifact, even after a JSON re-import."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Mark an Epic as completed and it'll land here automatically.
            Export the gallery as JSON whenever you want a backup.
          </p>
        </div>
        {hasTrophies && (
          <button
            onClick={() => setExportOpen(true)}
            title="Download every trophy as a JSON file — useful as a backup or for sharing your accomplishments."
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Download className="h-3 w-3" />
            Export trophies
          </button>
        )}
      </header>

      {isLoading ? (
        <p className="text-sm text-trails-fg-dim">Loading...</p>
      ) : !hasTrophies ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <Trophy className="mx-auto h-10 w-10 text-trails-fg-dim" />
          <p className="mt-3 font-display text-sm uppercase tracking-widest text-trails-accent">
            Halls of Glory · Empty
          </p>
          <p className="mt-2 text-sm text-trails-fg-dim">
            No trophies yet. Complete an Epic and its sigil will land here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trophies!.map((t) => (
            <article
              key={t.id}
              className="rounded-lg border p-4"
              title={`Completed ${
                t.completedAt
                  ? new Date(t.completedAt).toISOString().slice(0, 10)
                  : "—"
              } · ${t.milestoneCount} milestones`}
            >
              {/* Pedestal: gold-ringed circular halo around the sigil */}
              <div className="relative mx-auto flex h-52 w-52 items-center justify-center">
                <span
                  className="absolute inset-0 rounded-full border-2 border-trails-accent/40"
                  aria-hidden
                />
                <span
                  className="absolute inset-3 rounded-full bg-trails-accent/5"
                  aria-hidden
                />
                <div
                  className="relative flex h-44 w-44 items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: t.sigilSvg }}
                />
              </div>

              <h2 className="!m-0 !border-0 !p-0 mt-3 text-center font-display text-base text-trails-accent">
                {t.title}
              </h2>
              {t.category && (
                <p
                  className="mt-1 text-center font-display text-[10px] uppercase tracking-widest"
                  style={{ color: t.category.color }}
                >
                  {t.category.name}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-trails-fg-dim">
                <span>
                  {t.milestoneCount}{" "}
                  {t.milestoneCount === 1 ? "milestone" : "milestones"}
                </span>
                <span>
                  {t.completedAt
                    ? new Date(t.completedAt).toISOString().slice(0, 10)
                    : "—"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <JsonExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Trophy Room"
        filename={`questline-trophies-${new Date().toISOString().slice(0, 10)}`}
        data={exportQuery.data ?? {}}
      />
    </div>
  );
}
