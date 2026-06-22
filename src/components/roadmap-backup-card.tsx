"use client";

import { useState } from "react";
import {
  Archive,
  BookOpen,
  Download,
  HardDriveDownload,
  HelpCircle,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";
import { EXAMPLE_PROFILE } from "@/lib/example-profile";
import type { ProfileJson } from "@/lib/json-shapes";
import { JsonExportDialog } from "@/components/json-export-dialog";
import { JsonImportDialog } from "@/components/json-import-dialog";

/**
 * Dashboard widget: full roadmap backup + restore.
 *
 * Sits alongside the existing "Export roadmap as markdown" button but
 * targets JSON (round-trippable). Mirrors the controls on /profile so the
 * user can back up / restore without leaving the dashboard.
 */
export function RoadmapBackupCard() {
  const utils = trpc.useUtils();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [lastImport, setLastImport] = useState<Record<string, number> | null>(
    null,
  );
  // When set, the import dialog pre-fills its textarea with this text on
  // open. We use it to drop the worked example in one click.
  const [importSeed, setImportSeed] = useState<string | undefined>(undefined);

  // Fetch the full export only when the dialog opens.
  const exportQuery = trpc.dataio.exportProfile.useQuery(undefined, {
    enabled: exportOpen,
  });

  const importProfile = trpc.dataio.importProfile.useMutation({
    onSuccess: () => {
      // After a profile import every cached query is stale. Bust the lot.
      utils.invalidate();
    },
  });

  const toast = useToast();
  const backupNow = trpc.dataio.backupNow.useMutation({
    onSuccess: (r) => {
      // Desktop build can reveal the file in Finder so backups are findable.
      const bridge = (
        window as unknown as { questline?: { revealPath?: (p: string) => void } }
      ).questline;
      toast({
        title: "Backup saved to disk",
        description: r.path,
        variant: "success",
        action: bridge?.revealPath
          ? { label: "Open folder", onClick: () => bridge.revealPath!(r.path) }
          : undefined,
      });
    },
    onError: (e) =>
      toast({ title: "Backup failed", description: e.message, variant: "error" }),
  });
  const restore = trpc.dataio.restoreGameSnapshot.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast({ title: "Progress restored", variant: "success" });
    },
  });
  const restartGame = trpc.dataio.restartGame.useMutation({
    onSuccess: (r) => {
      utils.invalidate();
      toast({
        title: "Game restarted",
        description: `Reset ${r.epics} epic${r.epics === 1 ? "" : "s"}, ${r.milestones} milestone${r.milestones === 1 ? "" : "s"}, ${r.steps} step${r.steps === 1 ? "" : "s"}.`,
        variant: "success",
        action: { label: "Undo", onClick: () => restore.mutate({ snapshot: r.snapshot }) },
      });
    },
  });
  const newGame = trpc.dataio.newGame.useMutation({
    onSuccess: (r) => {
      utils.invalidate();
      toast({
        title: "New game — everything wiped",
        description: `Deleted ${r.epics} epic${r.epics === 1 ? "" : "s"}, ${r.skills} skill${r.skills === 1 ? "" : "s"}, ${r.quests} quest${r.quests === 1 ? "" : "s"}, ${r.categories} categor${r.categories === 1 ? "y" : "ies"}, ${r.chapters} chapter${r.chapters === 1 ? "" : "s"}, and ${r.accounts + r.bills + r.goals} finance record${r.accounts + r.bills + r.goals === 1 ? "" : "s"}.`,
        variant: "error",
      });
    },
  });

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-trails-good" />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Full roadmap · Backup &amp; Restore
          </h2>
          <span
            title="One-click JSON snapshot of EVERY entity: Categories, Skills, Epics (with milestones, steps, resources), Quests, Accounts, Bills, Goals, and Preferences. Import the same shape back to merge — or flip Replace for a clean restore. The exact same controls live on /profile if you'd rather work there."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <label
          title="When ON, the import wipes your current data first. When OFF (default), the import only ADDS — existing data is preserved and only the JSON's entries are inserted."
          className="inline-flex items-center gap-1.5 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim"
        >
          <input
            type="checkbox"
            checked={replaceMode}
            onChange={(e) => setReplaceMode(e.target.checked)}
          />
          Replace on import
        </label>
      </div>

      <p className="mt-1 text-xs text-trails-fg-dim">
        Save a full snapshot of every entity in the app as one JSON file, or
        restore from one. Preview shows you exactly what will be added before
        anything is committed.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExportOpen(true)}
          title="Download the entire roadmap as one JSON file (great for moving between Macs or as a backup)"
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          <Download className="h-3 w-3" />
          Export roadmap JSON
        </button>
        <button
          onClick={() => {
            setImportSeed(undefined);
            setImportOpen(true);
          }}
          title="Paste or upload a roadmap JSON — preview will summarize what's inside before you confirm"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
        >
          <Upload className="h-3 w-3" />
          Import roadmap JSON
        </button>
        <button
          onClick={() => backupNow.mutate()}
          disabled={backupNow.isPending}
          title="Write a timestamped JSON snapshot to ~/Questline Backups (auto-runs once a day too). Keeps the latest 20."
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent disabled:opacity-50"
        >
          <HardDriveDownload className="h-3 w-3" />
          {backupNow.isPending ? "Backing up…" : "Back up to disk"}
        </button>
        <button
          onClick={() => {
            // Pre-fill the import dialog with a complete worked example
            // tied to a realistic set of long-term goals (exams, Java
            // project, NL relocation, Japan backup, university, fitness).
            // User can preview + adjust + confirm — no extra typing.
            setImportSeed(JSON.stringify(EXAMPLE_PROFILE, null, 2));
            setImportOpen(true);
          }}
          title="Pre-fill the import dialog with a complete worked example — preview shows you exactly what will be added before you confirm"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20"
        >
          <BookOpen className="h-3 w-3" />
          Watch an example JSON
        </button>
      </div>

      {lastImport && (
        <p className="mt-3 rounded-md border border-trails-good/60 bg-trails-good/10 p-2 text-xs text-trails-good">
          Imported:{" "}
          {Object.entries(lastImport)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${k}`)
            .join(" · ")}
        </p>
      )}

      {/* Restart Game — reset all progress, keep the structure. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-trails-trim/30 pt-3">
        <button
          onClick={() => {
            if (
              confirm(
                "Restart Game?\n\nThis marks EVERY Epic and Milestone as not completed and un-checks every Step — a fresh playthrough. Your structure, deadlines, resources, quests, skills and finances are kept. This can't be undone (export a backup first if unsure).",
              )
            ) {
              restartGame.mutate();
            }
          }}
          disabled={restartGame.isPending}
          title="Mark every Epic + Milestone as not completed and reset all step progress (a fresh playthrough). Structure and finances are kept."
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-bad/60 bg-trails-bad/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-bad hover:bg-trails-bad/20 disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          {restartGame.isPending ? "Restarting…" : "Restart Game"}
        </button>
        <span className="text-[11px] text-trails-fg-dim">
          Resets all progress (Epics, Milestones, Steps) — structure &amp;
          finances stay.
        </span>
      </div>

      {/* New Game — permanently delete EVERYTHING. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (
              confirm(
                "⚠️ New Game — DELETE EVERYTHING?\n\nThis permanently deletes ALL your data: every Epic, Milestone, Step, Resource, Skill, Category, Quest, Chapter Board, Trophy AND all finances (accounts, bills, goals).\n\nThis CANNOT be undone. Export a backup first if you might want it later.\n\nType OK to wipe and start completely fresh.",
              )
            ) {
              newGame.mutate();
            }
          }}
          disabled={newGame.isPending}
          title="Permanently delete every piece of content in your profile and start from a blank slate. This cannot be undone."
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-bad bg-trails-bad/20 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-bad hover:bg-trails-bad/30 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          {newGame.isPending ? "Wiping…" : "New Game"}
        </button>
        <span className="text-[11px] text-trails-fg-dim">
          Deletes <strong className="text-trails-bad">all data</strong> (incl.
          finances) — a blank slate. Cannot be undone.
        </span>
      </div>

      <JsonExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Full roadmap"
        filename={`questline-roadmap-${new Date().toISOString().slice(0, 10)}`}
        data={exportQuery.data ?? {}}
      />
      <JsonImportDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportSeed(undefined);
        }}
        shape="profile"
        title={
          replaceMode ? "Roadmap (REPLACE existing)" : "Roadmap (merge)"
        }
        initialText={importSeed}
        onSubmit={async (parsed) => {
          try {
            const counts = await importProfile.mutateAsync({
              profile: parsed as ProfileJson,
              mode: replaceMode ? "replace" : "merge",
            });
            setLastImport(counts);
            return { ok: true };
          } catch (err) {
            return {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }}
      />
    </section>
  );
}
