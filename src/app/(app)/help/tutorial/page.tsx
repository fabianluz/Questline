"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  ChevronLeft,
  ClipboardCopy,
  Cpu,
  FileJson,
  Flame,
  GitBranch,
  GraduationCap,
  HelpCircle,
  Mountain,
  Package,
  ScrollText,
  Sparkles,
  Square,
  Star,
  Swords,
  Tag,
  Tent,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { PromptCopyDialog } from "@/components/prompt-copy-dialog";
import { RequirementsSection } from "@/components/requirements-section";
import {
  HELP_PROMPT_JSON,
  HELP_PROMPT_RESTRUCTURE,
} from "@/lib/tutorial-prompts";

/**
 * /help/tutorial — concepts + vocabulary + worked examples.
 *
 * Two big things on this page:
 *   1. A concept card per entity (Epic / Milestone / Step / Resource /
 *      Skill / Category / Quest / Side Quest / Account / Bill / Goal /
 *      Save Point / Trophy) with worked examples drawn from a realistic
 *      goal set so the user can map their own notes.
 *   2. Two "See Help Prompt" buttons that pop the prepared LLM prompts:
 *        - HELP_PROMPT_RESTRUCTURE: raw notes → structured Questline notes
 *        - HELP_PROMPT_JSON:        structured notes → ProfileJson
 *      So a typical workflow is:
 *        notes.md → external LLM (prompt 1) → structured.md →
 *        external LLM (prompt 2) → profile.json →
 *        Dashboard "Import roadmap JSON" → Preview → Confirm.
 */

type ConceptCard = {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  oneLiner: string;
  details: string;
  example: string;
};

const CONCEPTS: ConceptCard[] = [
  {
    icon: Mountain,
    iconColor: "text-trails-info",
    title: "Epic",
    oneLiner:
      "A long-term priority — months to years. The top of the hierarchy.",
    details:
      "Optionally tagged with a Category (color-coded life area) and a Target Date. An Epic by itself does almost nothing — it's the container for the Milestones that carry the real work.",
    example:
      '"Move to the Netherlands" — category Languages, target 2027-04. Contains 7 milestones (Dutch A2, Dutch B1, English C2, driver\'s license, CNC prep, money ladder, OutSystems certs).',
  },
  {
    icon: Square,
    iconColor: "text-trails-good",
    title: "Milestone",
    oneLiner:
      "A checkpoint inside an Epic. Has a tier (0, 1, 2…). Optional date.",
    details:
      "Same tier = parallel work, higher tier = later in the journey. The Skill Tree auto-lays out tiers left-to-right. Set an estimatedAchievementDate and the Roadmap places it on the timeline + the node glows / pulses / fractures based on how close that deadline is.",
    example:
      "Inside the Move-to-NL Epic: Tier 0 \"Dutch A2\" + Tier 0 \"English C2\" + Tier 0 \"Save €10 000\" run in parallel. Tier 1 \"Dutch B1\" comes after A2 conceptually.",
  },
  {
    icon: ScrollText,
    iconColor: "text-trails-fg",
    title: "Step",
    oneLiner:
      "A single concrete task inside a Milestone. Just a title + a done flag.",
    details:
      "Use Steps for the chronological checklist a Milestone needs done. They auto-schedule into the Calendar Subscription using your Profile work-window settings.",
    example:
      "Milestone \"Phase 0 · Java basics\" → Step \"Watch a full Java course\".",
  },
  {
    icon: Package,
    iconColor: "text-trails-accent",
    title: "Resource",
    oneLiner:
      "A tool / book / link / budget attached to a Milestone.",
    details:
      "Has a `kind` (book, video, course, tool, article, other), a label, optional URL, and an `acquired` flag. A Resource can act as a prerequisite — milestones can stay locked until the Resource is acquired.",
    example:
      "(video) \"Java full course\" — https://www.youtube.com/watch?v=eIrMbAQSU34, acquired: false",
  },
  {
    icon: Star,
    iconColor: "text-trails-accent",
    title: "Skill",
    oneLiner:
      "A competency. Gains XP whenever a linked Milestone or Quest completes.",
    details:
      "Levels follow an N² curve (Lv 1 = 100 XP, Lv 5 = 2 500 XP, Lv 10 = 10 000 XP). Each completed Milestone grants 100 XP per linked Skill. Each completed Quest grants its xpReward.",
    example:
      "\"Statistics\", \"Java\", \"Dutch\", \"Endurance\", \"Strength\". Link them from any Milestone editor or from the Quest create form.",
  },
  {
    icon: Tag,
    iconColor: "text-trails-violet",
    title: "Category",
    oneLiner:
      "A color-coded life area. Tag your Epics so the tree color-codes itself.",
    details:
      "Keep the set small (3–6) — over-categorizing hurts color legibility on the Skill Tree and Roadmap. Suggested seeds: Education, Career, Languages, Health, Finance, Backup.",
    example:
      "Education (#5b2a86), Career (#1f7a4f), Languages (#2a6fbf), Health (#b51d2a), Finance (#e6a01a).",
  },
  {
    icon: Flame,
    iconColor: "text-trails-warn",
    title: "Quest (daily / weekly)",
    oneLiner:
      "A recurring habit. Cadence is daily or weekly. Optionally grants XP to a Skill.",
    details:
      "Completing one ticks a streak (consecutive periods done). Quests live outside the Epic hierarchy — they're for habits that don't decompose into Milestones.",
    example:
      "\"Read 10 pages\" — daily — +15 XP → Reading. \"Run 5 km\" — weekly — +30 XP → Endurance.",
  },
  {
    icon: Swords,
    iconColor: "text-trails-warn",
    title: "Side Quest (one-off)",
    oneLiner:
      "A spontaneous one-off challenge. cadence: one_off + difficulty + optional expiry.",
    details:
      "Use the Notice Board page for these. The AI Guide can generate fresh side quests from your overall context — useful when the long grind feels stale.",
    example:
      "\"Deep-clean the garage\" — difficulty hard — +40 XP.",
  },
  {
    icon: Briefcase,
    iconColor: "text-trails-good",
    title: "Inventory · Accounts, Bills, Goals",
    oneLiner:
      "RPG-flavored finance dashboard. All amounts stored as integer cents.",
    details:
      "Accounts are asset or liability. Bills are recurring outflows (weekly/monthly/yearly). Goals are savings targets, optionally linked to an Epic so \"Move to NL\" + \"Netherlands relocation fund\" stay visually tied.",
    example:
      "Account \"Main Checking\" (asset, checking, 2 485.00 EUR). Bill \"Internet\" (monthly, 49.99 EUR). Goal \"Netherlands relocation fund\" → target 10 000 EUR linked to the Move-to-NL Epic.",
  },
  {
    icon: Tent,
    iconColor: "text-trails-accent",
    title: "Save Point (weekly retro)",
    oneLiner:
      "A weekly reflection. Three short fields. AI Guide can draft them.",
    details:
      "Refreshes Monday UTC. Shows your past-week stats (quests completed, milestones completed, XP gained, top skill) above the three text fields.",
    example: "\"This week went well: shipped Phase 0 of the Mini-Git project…\"",
  },
  {
    icon: Trophy,
    iconColor: "text-trails-accent",
    title: "Trophy",
    oneLiner:
      "A completed Epic. Gets a unique SVG sigil generated from its id + title.",
    details:
      "Sigils are deterministic — the same Epic always renders the same artifact even after a JSON re-import.",
    example:
      "Complete \"Master Japanese\" → it lands in the Trophy Room with its own sigil.",
  },
];

export default function TutorialPage() {
  const [restructureOpen, setRestructureOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

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
          <GraduationCap className="h-6 w-6 text-trails-accent" />
          Tutorial · Concepts &amp; vocabulary
        </h1>
        <p className="max-w-3xl text-sm text-trails-fg-dim">
          What everything in this app actually means, with worked examples
          from a real goal set. Use this page as a map before you start
          structuring your own notes. Pair with{" "}
          <Link
            href="/help/getting-started"
            className="text-trails-accent underline hover:text-trails-accent-bright"
          >
            Getting started
          </Link>{" "}
          (screen-by-screen tour) for the full picture.
        </p>
      </header>

      {/* Requirements — runtimes Questline depends on */}
      <RequirementsSection />

      {/* Big idea */}
      <section className="rounded-lg border bg-trails-panel-dark p-4">
        <h2 className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-trails-accent" />
          The whole hierarchy in one breath
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-trails-fg">
          A few <strong className="text-trails-accent">Categories</strong>{" "}
          (life areas) group your{" "}
          <strong className="text-trails-accent">Epics</strong> (long-term
          priorities). Each Epic breaks into{" "}
          <strong className="text-trails-accent">Milestones</strong>{" "}
          (checkpoints), which break into{" "}
          <strong className="text-trails-accent">Steps</strong> (tasks) and
          optionally attach <strong className="text-trails-accent">Resources</strong>{" "}
          (links / books / tools). Each Milestone can grant XP to one or more{" "}
          <strong className="text-trails-accent">Skills</strong>. Alongside
          this main tree you keep recurring{" "}
          <strong className="text-trails-accent">Quests</strong> (habits) and
          spontaneous <strong className="text-trails-accent">Side Quests</strong>{" "}
          (one-off challenges). Money lives separately in{" "}
          <strong className="text-trails-accent">Inventory</strong>{" "}
          (Accounts + Bills + Goals).
        </p>
      </section>

      {/* Concept cards */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-trails-info" />
          Every concept, with a worked example
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONCEPTS.map((c) => {
            const Icon = c.icon;
            return (
              <article
                key={c.title}
                className="rounded-lg border p-4"
                title={c.oneLiner}
              >
                <h3 className="flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
                  <Icon className={"h-4 w-4 " + c.iconColor} />
                  {c.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-trails-fg">
                  {c.oneLiner}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-trails-fg-dim">
                  {c.details}
                </p>
                <div className="mt-3 rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 p-2 font-mono text-[10px] italic text-trails-accent-bright">
                  e.g. {c.example}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Two-step LLM workflow */}
      <section className="rounded-lg border bg-trails-panel-dark p-4">
        <h2 className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-trails-good" />
          Convert raw notes into Questline (two-prompt workflow)
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-trails-fg">
          You probably already keep life-goal notes in a markdown file,
          Notion, Obsidian, whatever. Here's the fastest path from those
          notes to a populated Questline app, using any external LLM
          (ChatGPT, Claude, even your local Ollama chat):
        </p>

        <ol className="mt-3 ml-5 space-y-3 text-sm text-trails-fg">
          <li>
            <strong className="text-trails-accent">
              Step 1 — Restructure your notes.
            </strong>{" "}
            Click the first button below to copy a long prompt. Paste it
            into an LLM, then append your raw bullet-list notes. The LLM
            outputs a clean, app-aware structure (Categories / Skills /
            Epics with tier-ordered Milestones / Steps / Resources /
            Quests / Inventory).
          </li>
          <li>
            <strong className="text-trails-accent">
              Step 2 — Convert structure to JSON.
            </strong>{" "}
            Click the second button. Paste the prompt into a new LLM
            conversation, then append the structured notes from Step 1.
            The LLM outputs a single JSON object.
          </li>
          <li>
            <strong className="text-trails-accent">Step 3 — Import.</strong>{" "}
            Back on the Dashboard, click{" "}
            <strong>Import roadmap JSON</strong> on the Full Roadmap card.
            Paste the JSON, hit{" "}
            <strong>Preview</strong> to see every category / skill /
            epic / milestone that will be added, then{" "}
            <strong>Confirm import</strong>.
          </li>
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setRestructureOpen(true)}
            className="jrpg-btn inline-flex items-center gap-1.5"
            title="Prompt #1 — raw notes → structured Questline notes"
          >
            <ClipboardCopy className="h-3 w-3" />
            See Help Prompt
          </button>
          <button
            onClick={() => setJsonOpen(true)}
            className="jrpg-btn jrpg-btn--ghost inline-flex items-center gap-1.5"
            title="Prompt #2 — structured notes → JSON for this app's import dialog"
          >
            <FileJson className="h-3 w-3" />
            See Help Prompt (JSON)
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
          >
            Import →
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* Local AI pipeline — shipped! */}
      <section className="rounded-lg border border-trails-accent/60 bg-trails-bg-glow/40 p-4">
        <h2 className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-trails-accent" />
          Local AI series (notes → app, on this Mac)
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-trails-fg">
          You can now run the entire two-prompt flow{" "}
          <strong className="text-trails-accent">inside Questline</strong>,
          locally via Ollama, with a verification step between every
          transformation. Your notes never leave this Mac.
        </p>
        <ol className="mt-3 ml-5 list-decimal space-y-1.5 text-sm text-trails-fg">
          <li>
            <Link
              href="/ai/notes"
              className="font-display uppercase tracking-widest text-trails-accent underline hover:text-trails-accent-bright"
            >
              /ai/notes
            </Link>{" "}
            — paste or upload raw notes (markdown, plain text).
          </li>
          <li>
            <Link
              href="/ai/restructure"
              className="font-display uppercase tracking-widest text-trails-accent underline hover:text-trails-accent-bright"
            >
              /ai/restructure
            </Link>{" "}
            — local Ollama streams the structured-Questline-vocabulary
            output; you verify + edit inline.
          </li>
          <li>
            <Link
              href="/ai/serialize"
              className="font-display uppercase tracking-widest text-trails-accent underline hover:text-trails-accent-bright"
            >
              /ai/serialize
            </Link>{" "}
            — local Ollama converts the structure to ProfileJson; live
            Zod validation + preview of every category / skill / epic
            that will be added.
          </li>
          <li>
            <Link
              href="/ai/commit"
              className="font-display uppercase tracking-widest text-trails-accent underline hover:text-trails-accent-bright"
            >
              /ai/commit
            </Link>{" "}
            — final review + merge/replace toggle + one click commits
            via the same <code>dataio.importProfile</code> the manual
            Import dialog uses.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/ai/notes"
            className="jrpg-btn inline-flex items-center gap-1.5"
            title="Start the local AI pipeline now"
          >
            <Cpu className="h-3 w-3" />
            Open the pipeline
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-xs text-trails-fg-dim">
          Drafts persist in localStorage between page navigation, so you
          can leave and come back. The Tutorial's two prompt buttons
          above still work for anyone who'd rather drive the flow
          externally — the prompts in{" "}
          <code className="font-mono">src/lib/tutorial-prompts.ts</code>{" "}
          are the same ones the in-app pipeline uses.
        </p>
      </section>

      {/* Dialogs */}
      <PromptCopyDialog
        open={restructureOpen}
        onClose={() => setRestructureOpen(false)}
        title="Help Prompt · Restructure notes"
        subtitle="Step 1 — paste this into any LLM, then append your raw notes after."
        prompt={HELP_PROMPT_RESTRUCTURE}
        filename="questline-prompt-restructure"
      />
      <PromptCopyDialog
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        title="Help Prompt · Convert to JSON"
        subtitle="Step 2 — paste this into any LLM, then append the structured notes from Step 1."
        prompt={HELP_PROMPT_JSON}
        filename="questline-prompt-json"
      />
    </div>
  );
}
