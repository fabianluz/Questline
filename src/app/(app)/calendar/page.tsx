"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronLeft,
  ExternalLink,
  Info,
  Smartphone,
} from "lucide-react";
import { CalendarSubscriptionCard } from "@/components/calendar-subscription-card";
import { ExternalCalendarImportCard } from "@/components/external-calendar-import-card";

/**
 * /calendar — dedicated screen for two-way calendar sync.
 *
 *   • Outbound: subscribe in Apple/Google/Outlook via the per-user secret
 *     URL, or build an on-demand .ics bundle with exactly the events you
 *     want.
 *   • Inbound: upload an .ics file from any external calendar, preview the
 *     events, and import only the ones you want.
 *
 * Pulled off the Dashboard so the explanation has room to breathe. Each
 * card now ships with an "Examples" panel showing what the events actually
 * look like in each direction.
 */
export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-trails-fg-dim hover:text-trails-accent"
      >
        <ChevronLeft className="h-3 w-3" /> Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-trails-accent" />
          Calendar sync
        </h1>
        <p className="max-w-3xl text-sm text-trails-fg-dim">
          Questline plays both sides of the .ics format. <strong>Out:</strong>{" "}
          publish your milestones, quests, bills and steps so they show up in
          Apple Calendar / Google Calendar / Outlook. <strong>In:</strong>{" "}
          ingest an external calendar so its events overlay on your Roadmap
          and the Skill Tree.
        </p>
      </header>

      {/* --- Outbound: Subscription + Export ------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-4 w-4 text-trails-good" />
          <h2 className="!m-0 !border-0 !p-0">
            Outbound · publish Questline to your calendar
          </h2>
        </div>

        <details className="rounded-md border border-zinc-200">
          <summary className="cursor-pointer p-3 text-sm font-medium">
            <Info className="mr-1 inline h-3.5 w-3.5 text-trails-info" />
            How events appear in your calendar app
          </summary>
          <div className="space-y-2 px-3 pb-3 text-xs text-trails-fg-dim">
            <ExampleEvent
              emoji="📌"
              title="Pass JLPT N5"
              line2="Epic: Master Japanese · Tier 2"
              line3="all-day · 2026-09-20"
              note="Milestones with an estimated date — one all-day event each."
            />
            <ExampleEvent
              emoji="⚔"
              title="Finish Genki I exercises"
              line2="Step of: Pass JLPT N5"
              line3="weekdays 09:00–09:45 (in your work window)"
              note="Incomplete Steps auto-scheduled into your work window."
            />
            <ExampleEvent
              emoji="🎯"
              title="Read 10 pages"
              line2="Grants +15 XP to Japanese: Reading"
              line3="repeats daily"
              note="Recurring quests with FREQ=DAILY / FREQ=WEEKLY."
            />
            <ExampleEvent
              emoji="❗"
              title="Deep-clean the garage"
              line2="Side quest (one-off)"
              line3="2026-06-15"
              note="One-off side quests with an expiry date."
            />
            <ExampleEvent
              emoji="💳"
              title="Internet (49.99 EUR)"
              line2="utilities · monthly"
              line3="repeats monthly"
              note="Recurring bills with cadence-driven RRULE."
            />
            <p className="pt-1 italic">
              Tip: the subscription URL is read-only and per-user secret. Hit
              Rotate if you ever share it by accident.
            </p>
          </div>
        </details>

        <CalendarSubscriptionCard />
      </section>

      {/* --- Inbound: External imports ------------------------------------ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="h-4 w-4 text-trails-info" />
          <h2 className="!m-0 !border-0 !p-0">
            Inbound · bring an external calendar in
          </h2>
        </div>

        <details className="rounded-md border border-zinc-200">
          <summary className="cursor-pointer p-3 text-sm font-medium">
            <Info className="mr-1 inline h-3.5 w-3.5 text-trails-info" />
            How imported events appear inside Questline
          </summary>
          <div className="space-y-2 px-3 pb-3 text-xs text-trails-fg-dim">
            <ExampleEvent
              emoji="📅"
              title="Team standup"
              line2="From: Work calendar"
              line3="2026-06-09 · 10:00–10:30"
              note="Each imported VEVENT becomes a read-only entry in the external_event table. They mirror back into your outbound .ics under the 📅 prefix if you enable 'External' in the export bundle."
            />
            <p className="pt-1">
              <strong className="text-trails-fg">Where they show up:</strong>
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                Overlaid on the <Link href="/roadmap" className="underline">Roadmap</Link>{" "}
                as colored bars (using the source color you picked)
              </li>
              <li>
                Mirrored back through the subscription feed (toggleable in the
                Export Bundle)
              </li>
              <li>
                Listed under "Sources" on this page so you can delete a whole
                source at once
              </li>
            </ul>
            <p className="pt-1">
              <strong className="text-trails-fg">Privacy:</strong> the file
              stays on this Mac. Postgres + Ollama + Next dev server, that's
              the whole pipeline.
            </p>
            <p className="pt-1">
              <strong className="text-trails-fg">Selecting events:</strong>{" "}
              the upload dialog shows every VEVENT in the file with a
              checkbox so you can keep just the ones you care about.
            </p>
          </div>
        </details>

        <ExternalCalendarImportCard />
      </section>

      {/* --- Footer hint ---------------------------------------------------- */}
      <section className="rounded-md border border-zinc-200 p-4 text-xs">
        <p className="flex items-start gap-2 text-trails-fg-dim">
          <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trails-accent" />
          <span>
            <strong className="text-trails-fg">Apple Calendar setup:</strong>{" "}
            click "Subscribe in Apple Calendar" above and macOS will prompt to
            auto-refresh hourly. The default refresh interval embedded in the
            feed is <code className="font-mono">PT1H</code>.{" "}
            <a
              href="https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-0.5 underline"
            >
              Apple docs <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </span>
        </p>
      </section>
    </div>
  );
}

function ExampleEvent({
  emoji,
  title,
  line2,
  line3,
  note,
}: {
  emoji: string;
  title: string;
  line2: string;
  line3: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-trails-trim-soft/40 bg-trails-bg-deep/40 p-2">
      <div className="font-display text-sm text-trails-accent-bright">
        {emoji} {title}
      </div>
      <div className="font-mono text-[10px] text-trails-fg-dim">{line2}</div>
      <div className="font-mono text-[10px] text-trails-fg-dim">{line3}</div>
      <div className="mt-1 text-[11px] italic text-trails-fg-dim">{note}</div>
    </div>
  );
}
