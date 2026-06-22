"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  ChevronLeft,
  Compass,
  Cpu,
  FileJson,
  Flame,
  Mountain,
  ScrollText,
  Sparkles,
  Swords,
  Target,
  TreePine,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/**
 * /help/getting-started
 *
 * A flat, scrollable tour of every major surface in Questline. Reachable
 * from the dashboard's help links and from the Profile page. Each section
 * explains *what* the surface is for + *why* you'd open it + a "Try it"
 * CTA that drops the user into the right page.
 *
 * Intentionally linear and static — no animated walkthrough overlay. JRPG
 * menus are best when nothing is hiding the content.
 */

type TourSection = {
  num: number;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  blurb: string;
  details: string;
  tryLabel: string;
  tryHref: string;
  tips?: string[];
};

const TOUR: TourSection[] = [
  {
    num: 1,
    icon: Mountain,
    iconColor: "text-trails-info",
    title: "Epics — your long-term priorities",
    blurb:
      "Each Epic is a multi-month ambition (“Master Japanese,” “Move to the Netherlands”).",
    details:
      "Open Epics → New Epic. Pick a Category so the tree color-codes life areas at a glance. An Epic is just a title + description + optional target date — Milestones inside it carry the real work.",
    tryLabel: "Open Epics",
    tryHref: "/epics",
    tips: [
      "Don't worry about the perfect structure. You'll iterate as you go.",
      "The AI Guide button on each Epic page proposes Milestones for you.",
    ],
  },
  {
    num: 2,
    icon: Target,
    iconColor: "text-trails-good",
    title: "Milestones, Steps, Resources, Skills",
    blurb:
      "Inside an Epic, break things down into checkpoint Milestones. Each Milestone has Steps (a chronological checklist), Resources (links + tools), and Skills it grants XP to on completion.",
    details:
      "Tier and position drive the Skill Tree layout. Same tier = parallel work. Higher tier = later in the journey. Set an Estimated Achievement Date and the Roadmap places it on the timeline + the tree node glows as the deadline nears.",
    tryLabel: "Open an Epic",
    tryHref: "/epics",
  },
  {
    num: 3,
    icon: TreePine,
    iconColor: "text-trails-accent",
    title: "Skill Tree — see your life as a JRPG progression",
    blurb:
      "Visualizes every Milestone in every Epic. Soft edges thread tier order, hard edges show prerequisites.",
    details:
      "Nodes are color-coded by Category. Approaching deadlines glow amber; overdue ones pulse red; completed ones halo green. Steps and Resources show up as smaller chips beneath the Milestone they belong to.",
    tryLabel: "Open the Skill Tree",
    tryHref: "/tree",
  },
  {
    num: 4,
    icon: Compass,
    iconColor: "text-trails-info",
    title: "Roadmap — month-by-month timeline",
    blurb:
      "Global view stacks all your Milestones on a horizontal time axis. Parallel work shares a row.",
    details:
      "Filter by Category to isolate a single life area, or open the dedicated per-category roadmap at /roadmap/<categoryId>. The Roadmap also overlays any external calendars you've imported.",
    tryLabel: "Open the Roadmap",
    tryHref: "/roadmap",
  },
  {
    num: 5,
    icon: Flame,
    iconColor: "text-trails-warn",
    title: "Daily Quests + Notice Board",
    blurb:
      "Quests are recurring habits (“Read 10 pages”). Notice Board is for one-off side quests (“Deep-clean the garage”).",
    details:
      "Quest completions count toward the linked Skill's XP, exactly like Milestone completions do. Streaks build on consecutive periods. Side quests have a difficulty (trivial / normal / hard) that determines the XP reward.",
    tryLabel: "Open Quests",
    tryHref: "/quests",
    tips: [
      "Use the AI Guide on the Notice Board to generate fresh side quests when you're feeling stuck.",
    ],
  },
  {
    num: 6,
    icon: Briefcase,
    iconColor: "text-trails-good",
    title: "Inventory — RPG-flavored finance dashboard",
    blurb:
      "Accounts (assets + liabilities), recurring Bills, and savings Goals.",
    details:
      "Every amount is stored as integer cents — no float drift, easy to sum in SQL. Goals can be linked to an Epic so a “Move to the Netherlands” Epic and a “Netherlands relocation fund” Goal stay visually tied.",
    tryLabel: "Open Inventory",
    tryHref: "/inventory",
  },
  {
    num: 7,
    icon: Calendar,
    iconColor: "text-trails-accent",
    title: "Calendar — two-way .ics sync",
    blurb:
      "Subscribe externally via a per-user secret URL. Upload .ics files from other calendars. Build on-demand export bundles.",
    details:
      "The subscription URL emits Milestones with target dates, daily/weekly Quests as RRULEs, recurring Bills, side quests, and Steps auto-blocked into your work window. The Export Bundle button on the dashboard lets you pick exactly which events to include in a one-shot .ics download.",
    tryLabel: "Configure calendars",
    tryHref: "/dashboard",
  },
  {
    num: 8,
    icon: Cpu,
    iconColor: "text-trails-info",
    title: "AI Guide — local, on-device",
    blurb:
      "The Guide runs entirely on your laptop via Ollama. No cloud, no API keys.",
    details:
      "Capabilities: break-down an Epic into Milestones, suggest schedule adjustments, recommend resources for a Milestone, generate side quests, draft your weekly retrospective. The Dashboard's AI Guide card is a traffic light for the Ollama daemon + your default model.",
    tryLabel: "Ollama setup walkthrough",
    tryHref: "/help/ollama",
  },
  {
    num: 9,
    icon: FileJson,
    iconColor: "text-trails-warn",
    title: "JSON import / export — bring your own data",
    blurb:
      "Every entity (and the full Profile) can be imported and exported as JSON.",
    details:
      "Look for the small (?) icon next to any Import button. It opens a dialog with the JSON schema, a worked example, and a “Copy as LLM prompt” that asks an LLM to generate that exact shape. Paste the result back into the Import dialog and you're done.",
    tryLabel: "Try a Profile backup",
    tryHref: "/profile",
    tips: [
      "Profile backup is the easiest way to move your data between machines.",
      "Imports are merge-by-default. Flip the Replace toggle to wipe-then-restore.",
    ],
  },
  {
    num: 10,
    icon: Trophy,
    iconColor: "text-trails-accent",
    title: "Trophy Room",
    blurb:
      "Completed Epics get a deterministic SVG sigil that lives forever on /trophy-room.",
    details:
      "Mark an Epic as completed and it lands here automatically. The sigil is generated from the Epic's id and title, so the same Epic always renders the same artifact — even after a JSON re-import. Export the whole gallery as JSON whenever you want.",
    tryLabel: "Open Trophy Room",
    tryHref: "/trophy-room",
  },
  {
    num: 11,
    icon: ScrollText,
    iconColor: "text-trails-good",
    title: "Save Point — weekly retrospective",
    blurb:
      "Friendly weekly review with stats and three reflection fields.",
    details:
      "Lives on the Dashboard. Computed stats (Quests completed, Milestones completed, XP gained, top Skill) are shown above three text fields: what went well, what struggled, focus for next week. The AI Guide can draft all three from your stats if you press the Sparkle button.",
    tryLabel: "Back to Dashboard",
    tryHref: "/dashboard",
  },
];

export default function GettingStartedPage() {
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
          <Sparkles className="h-6 w-6 text-trails-accent" />
          Getting started
        </h1>
        <p className="max-w-2xl text-sm text-trails-fg-dim">
          A guided tour of every major screen in Questline. You can come back
          to this page any time from the dashboard help links. Each section
          ends with a button that drops you straight into the relevant page.
        </p>
        <p className="max-w-2xl text-sm text-trails-fg-dim">
          Need a vocabulary refresher first? See{" "}
          <Link
            href="/help/tutorial"
            className="text-trails-accent underline hover:text-trails-accent-bright"
          >
            Tutorial &amp; concepts
          </Link>{" "}
          — it explains every entity (Epic / Milestone / Skill / Quest / …)
          with worked examples, and includes two LLM prompts for turning
          your existing notes into a populated Questline.
        </p>
      </header>

      <section className="rounded-lg border bg-trails-panel-dark p-4">
        <h2 className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-trails-accent" />
          The big idea
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-trails-fg">
          Questline turns your life into a JRPG progression. Long-term
          ambitions are{" "}
          <strong className="text-trails-accent">Epics</strong>. Inside each
          Epic you have{" "}
          <strong className="text-trails-accent">Milestones</strong>, broken
          into <strong className="text-trails-accent">Steps</strong>,{" "}
          <strong className="text-trails-accent">Resources</strong>, and the{" "}
          <strong className="text-trails-accent">Skills</strong> they grant
          XP to. A separate habit tracker (
          <strong className="text-trails-accent">Daily Quests</strong>) and a
          one-off side-quest{" "}
          <strong className="text-trails-accent">Notice Board</strong> sit
          alongside. An optional{" "}
          <strong className="text-trails-accent">AI Guide</strong>, running
          locally on your machine, helps when you're stuck.
        </p>
      </section>

      <ol className="space-y-4">
        {TOUR.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.num}
              className="rounded-lg border bg-trails-panel-dark p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-trails-trim bg-trails-panel font-display text-lg text-trails-accent">
                  {s.num}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2">
                    <Icon className={"h-4 w-4 " + s.iconColor} />
                    {s.title}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-trails-fg">
                    {s.blurb}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-trails-fg-dim">
                    {s.details}
                  </p>
                  {s.tips && (
                    <ul className="mt-3 space-y-1 border-l-2 border-trails-trim/50 pl-3">
                      {s.tips.map((t, i) => (
                        <li
                          key={i}
                          className="text-xs italic text-trails-fg-dim"
                        >
                          <Sparkles className="mr-1 inline h-3 w-3 text-trails-accent" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={s.tryHref}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {s.tryLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border bg-trails-panel-dark p-4">
        <h2 className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-trails-accent" />
          Cheatsheet
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <CheatItem
            label="Add a long-term goal"
            value={"Epics → New Epic"}
          />
          <CheatItem
            label="Break it down"
            value={"Open the Epic → Ask the Guide"}
          />
          <CheatItem
            label="See it all visually"
            value={"Skill Tree (⌘+K + “tree”)"}
          />
          <CheatItem
            label="Daily check-in"
            value="Dashboard → Today's Quests"
          />
          <CheatItem
            label="Subscribe in your calendar"
            value={"Dashboard → Calendar Subscription"}
          />
          <CheatItem
            label="Back up everything"
            value={"Profile → Export profile JSON"}
          />
        </dl>
      </section>
    </div>
  );
}

function CheatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-trails-fg-dim">
        {label}
      </dt>
      <dd className="font-display text-sm text-trails-accent">{value}</dd>
    </div>
  );
}
