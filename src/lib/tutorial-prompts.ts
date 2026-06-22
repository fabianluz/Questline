/**
 * Two carefully-built prompts the user can paste into any external LLM to
 * (1) restructure free-form bullet notes into Questline-aware structure
 * (2) convert that structure into the exact JSON shape `dataio.importProfile`
 *     accepts.
 *
 * Keeping them in a typed module (not raw markdown) lets us version them
 * alongside the schema. If the JSON shape ever changes, this file MUST be
 * updated in lockstep with src/lib/json-shapes.ts.
 */

export const HELP_PROMPT_RESTRUCTURE = `You are helping me restructure raw, free-form bullet-point life-goal notes into a well-organized hierarchy that maps cleanly to "Questline" — a gamified life-management app.

==========================================================================
Questline vocabulary
==========================================================================
- Epic        : a long-term priority spanning months to years
                (e.g. "Master Japanese", "Move to the Netherlands").
                Optionally tagged with a Category and a target date.
- Milestone   : a major checkpoint inside an Epic
                (e.g. "Pass JLPT N5", "Save 10 000 EUR").
                Has a tier (integer 0,1,2…). Same tier = parallel work.
                Higher tier = later in the journey. Optional
                estimatedStartDate (when work begins) and
                estimatedAchievementDate (target completion).
- Step        : a single concrete actionable task inside a Milestone
                (e.g. "Watch a full Java course").
- Resource    : a tool / link / book / budget attached to a Milestone
                (kind, label, url, notes, acquired flag).
- Skill       : a competency that gains XP whenever a linked Milestone or
                Quest completes (e.g. "Statistics", "Dutch", "Spring Boot").
- Category    : a color-coded life area (Health, Finance, Education,
                Languages, Career, Backup, …).
- Quest       : a recurring habit. cadence = "daily" | "weekly".
                Optionally grants XP to a linked Skill on each completion.
- Side Quest  : a one-off spontaneous quest. cadence = "one_off",
                difficulty = trivial | normal | hard, optional expiry date.
- Account     : a financial-inventory entry, asset or liability.
- Bill        : a recurring outflow, cadence weekly | monthly | yearly.
- Goal        : a savings target, optionally linked to an Epic.

==========================================================================
What I want from you
==========================================================================
1. Read my raw notes (below).
2. Map them into the vocabulary above. Don't add filler — if a section is
   missing in my notes, leave it empty.
3. Make tier ordering explicit:
   - Parallel milestones share a tier (start with tier 0 unless ordering
     matters).
   - Sequential milestones increment (Phase 0 → Phase 1 → Phase 2 …).
4. If one Epic gates another in my notes ("nothing else until X"), note it
   under "Gates" / "Gated by" on each Epic. Questline can't express this
   with a single click but I'll model it via tier ordering in the gated
   Epics + leaving their status "not_started" until the gate is clear.
5. Propose a small Category set (3–6 categories max — over-categorizing
   hurts color legibility on the Skill Tree).
6. Propose Skills that emerge naturally from the notes. Re-use the same
   Skill across multiple Milestones when relevant.
7. Output as readable markdown using the headers below, EXACTLY:

==========================================================================
Output format
==========================================================================
## Categories
- Name (color suggestion as a hex like #5b2a86)

## Skills
- Name — short one-line description

## Epics
### {Epic title} (Category: {category}, target: {YYYY-MM-DD or "—"}, status: {not_started|in_progress|completed|paused|abandoned})
**Description:** ...
**Gates:** [other Epics this one blocks, or "—"]
**Gated by:** [other Epics this depends on, or "—"]
- Tier 0 — {Milestone title} (estimated: YYYY-MM-DD or "—")
  - skills: SkillName, SkillName
  - steps:
    - Step 1
    - Step 2
  - resources:
    - (kind) label — url
- Tier 0 — {Milestone title} (parallel with above)
  - ...
- Tier 1 — {Milestone title}
  - ...

## Quests (recurring habits)
- {Title} — daily | weekly — +{XP} → {SkillName or "no skill"}

## Side Quests (one-off, spontaneous)
- {Title} — difficulty {trivial|normal|hard} — +{XP}

## Inventory
### Accounts
- {Name} ({asset|liability}, {checking|savings|loan|…}) — {balance EUR}
### Bills
- {Name} ({weekly|monthly|yearly}) — {amount EUR} — next due {YYYY-MM-DD or "—"}
### Goals
- {Name} — target {amount EUR} → {Epic title or "—"}

==========================================================================
NOW HERE ARE MY RAW NOTES — restructure them below:
==========================================================================
`;

export const HELP_PROMPT_JSON = `You are converting structured Questline life-goal notes (already organized into Epics / Milestones / Steps / Skills / Categories / Quests / Accounts / Bills / Goals) into ONE JSON object that imports into Questline via its Dashboard "Import roadmap JSON" button.

Output ONLY the JSON object. No markdown fences, no preamble, no commentary.

==========================================================================
Exact schema
==========================================================================
{
  "version": 1,
  "categories": [
    { "name": "Education", "color": "#5b2a86", "icon": null }
  ],
  "skills": [
    { "key": "statistics" /* stable slug, optional but recommended */,
      "name": "Statistics", "description": "Short description or null",
      "domain": "Math" /* grouping, or null */,
      "targetDate": "YYYY-MM-DD" /* or null */,
      "requires": ["algebra"] /* prerequisite skills by key or name; constellation edges */ }
  ],
  "epics": [
    {
      "key": "move-nl" /* stable slug, optional but recommended */,
      "title": "Move to the Netherlands",
      "description": "...",
      "status": "not_started | in_progress | completed | paused | abandoned",
      "targetDate": "YYYY-MM-DD" /* or null */,
      "category": "Education" /* category NAME — resolved on import; missing categories auto-created with a default color */,
      "milestones": [
        {
          "key": "dutch-a2" /* stable slug, optional but recommended */,
          "title": "Dutch — CNaVT A2",
          "description": "Optional",
          "status": "not_started",
          "tier": 0,                       /* same tier = parallel work */
          "position": 0,
          "estimatedStartDate": "YYYY-MM-DD" /* when work begins, or null */,
          "estimatedAchievementDate": "YYYY-MM-DD" /* target completion, or null */,
          "estimatedHours": 120,           /* rough effort, feeds the capacity view, or null */
          "requires": ["dutch-a1"],        /* other milestones that must come first, by key or title */
          "skills": ["Dutch"],             /* skill NAMES — resolved on import; missing ones are silently ignored unless they also appear in the top-level "skills" array */
          "steps": [
            { "title": "Step text", "description": null, "isCompleted": false,
              "dueDate": "YYYY-MM-DD" /* or null */,
              "estimatedMinutes": 90 /* rough effort, or null */ }
          ],
          "resources": [
            { "kind": "book|video|course|tool|article|other",
              "label": "Genki I", "url": "https://...", "notes": null,
              "acquired": false }
          ]
        }
      ]
    }
  ],
  "quests": [
    {
      "key": "read-10" /* stable slug, optional but recommended */,
      "title": "Read 10 pages",
      "description": null,
      "cadence": "daily | weekly | one_off",
      "xpReward": 15,
      "skill": "Skill NAME" /* or null */,
      "difficulty": "trivial | normal | hard" /* or null; required only for cadence:"one_off" */,
      "expiresAt": "ISO 8601 datetime" /* or null */,
      "startDate": "YYYY-MM-DD" /* recurring quest only becomes active on/after this date, or null */,
      "endDate": "YYYY-MM-DD" /* recurring quest retires after this date, or null */,
      "timesPerPeriod": 4 /* target completions per period, e.g. gym 4×/week, or null */
    }
  ],
  "schedules": [
    { "key": "regular" /* optional */, "name": "Regular hours",
      "startTime": "08:00", "endTime": "18:00",
      "breakStart": "14:00", "breakEnd": "15:00" /* optional mid-day break (lunch), or null */,
      "days": "1111100" /* 7-char Mon..Sun mask */,
      "effectiveFrom": "YYYY-MM-DD" /* or null */, "effectiveTo": "YYYY-MM-DD" /* or null */,
      "priority": 0, "active": true, "color": null, "notes": null }
  ],
  "calendarBlocks": [
    { "key": "summer-holiday" /* optional */, "title": "Summer holiday",
      "kind": "holiday|time_off|travel|focus|busy|custom",
      "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
      "allDay": true, "startTime": null, "endTime": null,
      "blocksWork": true /* suppresses work for the span */, "color": null, "notes": null }
  ],
  "accounts": [
    { "name": "Main Checking", "kind": "asset | liability",
      "category": "checking | savings | cash | investment | credit_card | loan | mortgage | other",
      "balanceCents": 248500, "currency": "EUR", "notes": null }
  ],
  "bills": [
    { "name": "Internet", "amountCents": 4999, "currency": "EUR",
      "cadence": "weekly | monthly | yearly",
      "category": "rent|utility|subscription|insurance|transport|other",
      "nextDueDate": "YYYY-MM-DD" /* or null */ }
  ],
  "goals": [
    { "name": "Netherlands relocation fund", "targetCents": 1000000,
      "currentCents": 124000, "currency": "EUR",
      "targetDate": "YYYY-MM-DD" /* or null */,
      "epic": "Epic title" /* or null; resolved by title */,
      "status": "active | achieved | abandoned",
      "notes": null }
  ],
  "preferences": null
}

==========================================================================
Strict rules
==========================================================================
1. ALL monetary amounts are INTEGER CENTS. €10 000.00 → 1000000. Never use floats.
2. Tier numbers start at 0. Parallel milestones share a tier.
   Sequential milestones increment.
3. Category names referenced on Epics MUST appear in the top-level
   "categories" array.
4. Skill names referenced on Milestones / Quests MUST appear in the
   top-level "skills" array.
5. Epic titles referenced on Goals MUST appear in the top-level "epics"
   array.
6. Dates are "YYYY-MM-DD". Datetimes are full ISO 8601 (UTC suffix Z is fine).
7. status / kind / cadence / category / difficulty enums are case-sensitive.
8. Give every epic, milestone, skill and quest a stable lowercase "key"
   slug (letters, digits, "-", "_", ".", ":"). Keys make re-import idempotent
   (update-in-place, no duplicates) and let "requires" reference other items
   precisely. Keep keys unique within their kind.
9. "requires" on a milestone lists OTHER milestones that must finish first
   (by key, else title). "requires" on a skill lists prerequisite skills.
   Never reference something that isn't in the file; never self-reference.
10. estimatedHours (milestone) + estimatedMinutes (step) are rough effort
    numbers that power the capacity view — include them when you can infer them.
11. Output ONLY the JSON. No \`\`\`json\`\`\` fences. No commentary after the JSON.

==========================================================================
NOW HERE ARE MY STRUCTURED NOTES — emit the JSON below:
==========================================================================
`;
