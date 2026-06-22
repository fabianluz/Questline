"use client";

import { useState } from "react";
import Link from "next/link";
import { Compass, FileText, Swords, Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { ExportRoadmapModal } from "@/components/export-roadmap-modal";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { RoadmapBackupCard } from "@/components/roadmap-backup-card";
import { SavePointCard } from "@/components/save-point-card";
import { OllamaStatusCard } from "@/components/ollama-status-card";
import { TodaysQuestsCard } from "@/components/todays-quests-card";
import { PlayerHeroCard } from "@/components/player-hero-card";
import { TodayHubCard } from "@/components/today-hub-card";
import { WeeklyCoachCard } from "@/components/weekly-coach-card";
import { CapacityPanel } from "@/components/capacity-panel";
import { WorkspaceBundleCard } from "@/components/workspace-bundle-card";

/**
 * /dashboard — the user's "Inn / Save Point" landing screen.
 *
 * Cleaned up: removed the Top Skills section (it lived under /skills
 * anyway) and pulled the Calendar Subscription + External Calendar
 * widgets off to their own /calendar screen so this page is a daily
 * snapshot — quests, retro, AI status, jump-off actions.
 */
export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: epics, isLoading } = trpc.epic.list.useQuery();
  const [showExport, setShowExport] = useState(false);

  const total = epics?.length ?? 0;
  const active = epics?.filter((e) => e.status === "in_progress").length ?? 0;
  const completed =
    epics?.filter((e) => e.status === "completed").length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{session?.user.name ? `, ${session.user.name}` : ""}.
        </h1>
        <p className="mt-1 text-sm text-trails-fg-dim">
          Today's quests, this week's reflection, and your jump-off points.
        </p>
      </div>

      <PlayerHeroCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total Epics" value={isLoading ? "—" : String(total)} />
        <Stat label="In progress" value={isLoading ? "—" : String(active)} />
        <Stat label="Completed" value={isLoading ? "—" : String(completed)} />
      </div>

      <TodayHubCard />

      <CapacityPanel compact />

      <WeeklyCoachCard />

      <SavePointCard />

      <TodaysQuestsCard />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/epics"
          className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          title="View, create, edit, or delete your long-term priorities (Epics)."
        >
          Manage Epics →
        </Link>
        <Link
          href="/notice-board"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          title="One-off side quests when the long grind feels stale."
        >
          <Swords className="h-3.5 w-3.5" /> Notice Board
        </Link>
        <Link
          href="/trophy-room"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          title="Permanent gallery of completed Epics, with a unique sigil for each."
        >
          <Trophy className="h-3.5 w-3.5" /> Trophy Room
        </Link>
        <Link
          href="/help/getting-started"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          title="Tour every screen in 11 short sections."
        >
          <Compass className="h-3.5 w-3.5" /> Getting started
        </Link>
        <Link
          href="/help/tutorial"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          title="Concepts + vocabulary + two LLM help prompts for converting your existing notes."
        >
          <Compass className="h-3.5 w-3.5" /> Tutorial &amp; concepts
        </Link>
        <button
          type="button"
          onClick={() => setShowExport(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          title="Export your roadmap as markdown to paste into any external LLM."
        >
          <FileText className="h-3.5 w-3.5" />
          Export roadmap as markdown
        </button>
      </div>

      <OllamaStatusCard />

      <RoadmapBackupCard />

      <WorkspaceBundleCard />

      <NotificationSettingsCard />

      <ExportRoadmapModal
        open={showExport}
        onClose={() => setShowExport(false)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-trails-fg-dim">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
