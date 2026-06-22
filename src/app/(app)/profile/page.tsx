"use client";

import { useState } from "react";
import {
  Archive,
  Download,
  HelpCircle,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { useToast } from "@/components/toast";
import type { ProfileJson } from "@/lib/json-shapes";
import { JsonHelpDialog } from "@/components/json-help-dialog";
import { JsonExportDialog } from "@/components/json-export-dialog";
import { JsonImportDialog } from "@/components/json-import-dialog";

/**
 * /profile — the user's "save game" page.
 *
 *   - identity (name + email, read-only from session)
 *   - full-profile JSON backup + restore
 *   - work-window + notification preferences (round-trip)
 *
 * The Restore action defaults to "merge" — additive, never destructive —
 * with an explicit "Replace" toggle the user has to flip on.
 */
export default function ProfilePage() {
  const { data: session } = useSession();
  const { data: prefs } = trpc.wellbeing.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const savePrefs = trpc.wellbeing.updatePreferences.useMutation({
    onSuccess: () => utils.wellbeing.getPreferences.invalidate(),
  });
  const importProfile = trpc.dataio.importProfile.useMutation({
    onSuccess: () => {
      // After a profile import, every cached query is stale. Easiest path:
      // bust the entire tRPC cache.
      utils.invalidate();
    },
  });

  const toast = useToast();
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
        description: `Reset ${r.epics} epic${r.epics === 1 ? "" : "s"}, ${r.milestones} milestone${r.milestones === 1 ? "" : "s"} and ${r.steps} step${r.steps === 1 ? "" : "s"}.`,
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

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [lastImport, setLastImport] = useState<Record<string, number> | null>(null);

  // Fetch on-demand so we don't ship the whole user profile on first render.
  const exportProfileQuery = trpc.dataio.exportProfile.useQuery(undefined, {
    enabled: exportOpen,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl uppercase tracking-widest">
          <User className="h-6 w-6 text-jrpg-gold" />
          Profile
          <span
            title="Your account screen. Export every entity in the app as one JSON file (great for backups + moving between machines). Import the same shape back to merge — or flip the Replace toggle for a clean restore. Below: work-window preferences that drive Step→time-block scheduling in the calendar feed."
            className="text-jrpg-azure"
          >
            <HelpCircle className="h-4 w-4" />
          </span>
        </h1>
        <p className="mt-1 text-sm text-jrpg-muted">
          Save your game, restore from a backup, or tune the run-time
          preferences that shape the rest of Questline.
        </p>
      </header>

      {/* Identity */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-jrpg-violet" />
          <h2 className="font-display text-sm uppercase tracking-widest">
            Character
          </h2>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-jrpg-muted">Name</dt>
            <dd className="font-pixel text-[11px] text-jrpg-gold-bright">
              {session?.user.name || "(unset)"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-jrpg-muted">Email</dt>
            <dd className="font-mono text-xs text-jrpg-fg">
              {session?.user.email}
            </dd>
          </div>
        </dl>
      </section>

      {/* Backup + Restore */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-jrpg-emerald" />
          <h2 className="font-display text-sm uppercase tracking-widest">
            Save Game (Backup &amp; Restore)
          </h2>
          <JsonHelpDialog shape="profile" />
        </div>
        <p className="mt-1 text-xs text-jrpg-muted">
          Exports every Category, Skill, Epic, Milestone, Step, Resource,
          Quest, Account, Bill, Goal, and Preference as a single JSON file.
          Import restores any subset of those — merge or replace.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Download className="h-3 w-3" /> Export profile JSON
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Upload className="h-3 w-3" /> Import profile JSON
          </button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-jrpg-muted">
            <input
              type="checkbox"
              checked={replaceMode}
              onChange={(e) => setReplaceMode(e.target.checked)}
            />
            Replace existing data on import
          </label>
        </div>
        {lastImport && (
          <p className="mt-2 text-xs text-jrpg-emerald">
            Imported:{" "}
            {Object.entries(lastImport)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${n} ${k}`)
              .join(" · ")}
          </p>
        )}

        {/* Restart Game — reset all progress, keep the structure. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
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
            className="inline-flex items-center gap-1.5 rounded-md border border-jrpg-crimson/60 bg-jrpg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-jrpg-crimson hover:bg-jrpg-crimson/20 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            {restartGame.isPending ? "Restarting…" : "Restart Game"}
          </button>
          <span className="text-[11px] text-jrpg-muted">
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
                  "⚠️ New Game — DELETE EVERYTHING?\n\nThis permanently deletes ALL your data: every Epic, Milestone, Step, Resource, Skill, Category, Quest, Chapter Board, Trophy AND all finances (accounts, bills, goals).\n\nThis CANNOT be undone. Export a backup first if you might want it later.\n\nPress OK to wipe and start completely fresh.",
                )
              ) {
                newGame.mutate();
              }
            }}
            disabled={newGame.isPending}
            title="Permanently delete every piece of content in your profile and start from a blank slate. This cannot be undone."
            className="inline-flex items-center gap-1.5 rounded-md border border-jrpg-crimson bg-jrpg-crimson/20 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-jrpg-crimson hover:bg-jrpg-crimson/30 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {newGame.isPending ? "Wiping…" : "New Game"}
          </button>
          <span className="text-[11px] text-jrpg-muted">
            Deletes <strong className="text-jrpg-crimson">all data</strong> (incl.
            finances) — a blank slate. Cannot be undone.
          </span>
        </div>
      </section>

      {/* Preferences */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-jrpg-azure" />
          <h2 className="font-display text-sm uppercase tracking-widest">
            Preferences
          </h2>
          <JsonHelpDialog shape="preferences" />
        </div>
        {!prefs ? (
          <p className="mt-3 text-xs text-jrpg-muted">Loading...</p>
        ) : (
          <PreferencesForm
            initial={{
              workWindowStart: prefs.workWindowStart,
              workWindowEnd: prefs.workWindowEnd,
              workWindowDays: prefs.workWindowDays,
              defaultStepDurationMin: prefs.defaultStepDurationMin,
            }}
            onSave={(patch) => savePrefs.mutate(patch)}
            saving={savePrefs.isPending}
          />
        )}
      </section>

      <JsonExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Full profile"
        filename={`questline-profile-${new Date().toISOString().slice(0, 10)}`}
        data={exportProfileQuery.data ?? {}}
      />
      <JsonImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        shape="profile"
        title={replaceMode ? "Restore (REPLACE existing)" : "Restore (merge)"}
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
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function PreferencesForm({
  initial,
  onSave,
  saving,
}: {
  initial: {
    workWindowStart: string;
    workWindowEnd: string;
    workWindowDays: string;
    defaultStepDurationMin: number;
  };
  onSave: (patch: Partial<typeof initial>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(initial);

  function toggleDay(i: number) {
    const next = draft.workWindowDays.split("");
    next[i] = next[i] === "1" ? "0" : "1";
    setDraft({ ...draft, workWindowDays: next.join("") });
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Work-window start (UTC)">
          <input
            type="time"
            value={draft.workWindowStart}
            onChange={(e) =>
              setDraft({ ...draft, workWindowStart: e.target.value })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          />
        </Field>
        <Field label="Work-window end (UTC)">
          <input
            type="time"
            value={draft.workWindowEnd}
            onChange={(e) =>
              setDraft({ ...draft, workWindowEnd: e.target.value })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          />
        </Field>
        <Field label="Default Step block (min)">
          <input
            type="number"
            min={10}
            max={480}
            value={draft.defaultStepDurationMin}
            onChange={(e) =>
              setDraft({
                ...draft,
                defaultStepDurationMin: Number(e.target.value) || 45,
              })
            }
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-800 dark:bg-zinc-950"
          />
        </Field>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-jrpg-muted">
          Work days
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => toggleDay(i)}
              className={
                "rounded-md border px-2 py-1 font-pixel text-[10px] uppercase " +
                (draft.workWindowDays.charAt(i) === "1"
                  ? "border-jrpg-gold bg-jrpg-violet/60 text-jrpg-gold-bright"
                  : "border-zinc-200 text-zinc-500 dark:border-zinc-800")
              }
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onSave(draft)}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <Save className="h-3 w-3" /> Save preferences
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-jrpg-muted">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
