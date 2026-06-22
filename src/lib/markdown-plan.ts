/**
 * Reverse export — a Questline plan → readable Markdown (Planning v2, Phase 7).
 *
 * The capstone of the round-trip: notes → (AI) → keyed WorkspaceBundle →
 * import → … → export back to a Markdown master plan you can keep in Obsidian.
 * Pure + deterministic so it's unit-testable and runs client-side.
 *
 * Output is GitHub/Obsidian-flavored: `#` headings, `- [ ]` task checkboxes,
 * `**bold**` titles, and inline `` `key` `` slugs so a re-import (or an LLM
 * re-serialize) keeps stable identities.
 */

import type { ProfileJson, WorkspaceBundleJson } from "./json-shapes";

const DOW = ["M", "T", "W", "T", "F", "S", "S"]; // idx0 = Monday

function daysLabel(mask: string): string {
  return DOW.map((d, i) => (mask[i] === "1" ? d : "·")).join("");
}

function dateRange(from?: string | null, to?: string | null): string {
  if (!from && !to) return "";
  return `${from ?? "…"} → ${to ?? "…"}`;
}

function slug(key?: string | null): string {
  return key ? ` \`${key}\`` : "";
}

/** Render the entities (categories, skills, epics, quests, schedules, …). */
export function profileToMarkdown(profile: ProfileJson): string {
  const out: string[] = [];

  if (profile.categories.length) {
    out.push("## Categories", "");
    for (const c of profile.categories) {
      out.push(`- **${c.name}** \`${c.color}\`${c.icon ? ` ${c.icon}` : ""}`);
    }
    out.push("");
  }

  if (profile.skills.length) {
    out.push("## Skills", "");
    for (const s of profile.skills) {
      const meta = [s.domain, s.targetDate ? `target ${s.targetDate}` : null]
        .filter(Boolean)
        .join(" · ");
      out.push(`- **${s.name}**${slug(s.key)}${meta ? ` — ${meta}` : ""}${s.description ? ` — ${s.description}` : ""}`);
      if (s.requires?.length) out.push(`  - requires: ${s.requires.join(", ")}`);
    }
    out.push("");
  }

  if (profile.epics.length) {
    out.push("## Epics", "");
    for (const e of profile.epics) {
      const head = [e.status, e.category, e.targetDate ? `target ${e.targetDate}` : null]
        .filter(Boolean)
        .join(" · ");
      out.push(`### ${e.title}${slug(e.key)}${head ? ` — ${head}` : ""}`);
      if (e.description) out.push("", e.description);
      for (const m of e.milestones) {
        const done = m.status === "completed";
        const meta = [
          `tier ${m.tier}`,
          m.status,
          m.estimatedHours != null ? `~${m.estimatedHours}h` : null,
          dateRange(m.estimatedStartDate, m.estimatedAchievementDate) || null,
        ]
          .filter(Boolean)
          .join(" · ");
        out.push("", `- [${done ? "x" : " "}] **${m.title}**${slug(m.key)}${meta ? ` — ${meta}` : ""}`);
        if (m.description) out.push(`  - ${m.description}`);
        if (m.requires?.length) out.push(`  - requires: ${m.requires.join(", ")}`);
        if (m.skills.length) out.push(`  - skills: ${m.skills.join(", ")}`);
        if (m.steps.length) {
          out.push("  - Steps:");
          for (const st of m.steps) {
            const sm = [
              st.estimatedMinutes != null ? `~${st.estimatedMinutes}min` : null,
              st.dueDate ? `due ${st.dueDate}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            out.push(`    - [${st.isCompleted ? "x" : " "}] ${st.title}${sm ? ` (${sm})` : ""}`);
          }
        }
        if (m.resources.length) {
          out.push("  - Resources:");
          for (const r of m.resources) {
            out.push(`    - ${r.acquired ? "✓ " : ""}(${r.kind}) ${r.label}${r.url ? ` — ${r.url}` : ""}`);
          }
        }
      }
      out.push("");
    }
  }

  if (profile.quests.length) {
    out.push("## Quests", "");
    for (const q of profile.quests) {
      const meta = [
        q.skill ? `→ ${q.skill}` : null,
        q.xpReward ? `+${q.xpReward}xp` : null,
        q.timesPerPeriod ? `${q.timesPerPeriod}×/period` : null,
        q.difficulty,
        dateRange(q.startDate, q.endDate) || null,
      ]
        .filter(Boolean)
        .join(" · ");
      out.push(`- **[${q.cadence}] ${q.title}**${slug(q.key)}${meta ? ` — ${meta}` : ""}`);
    }
    out.push("");
  }

  if (profile.schedules.length) {
    out.push("## Schedule profiles", "");
    for (const s of profile.schedules) {
      const meta = [
        daysLabel(s.days),
        dateRange(s.effectiveFrom, s.effectiveTo) || "always",
        `priority ${s.priority}`,
        s.active === false ? "inactive" : null,
      ]
        .filter(Boolean)
        .join(" · ");
      out.push(`- **${s.name}**${slug(s.key)} ${s.startTime}–${s.endTime} — ${meta}`);
    }
    out.push("");
  }

  if (profile.calendarBlocks.length) {
    out.push("## Calendar blocks", "");
    for (const b of profile.calendarBlocks) {
      out.push(
        `- **${b.title}**${slug(b.key)} (${b.kind}) ${dateRange(b.startDate, b.endDate)}${b.blocksWork ? " — no work" : ""}`,
      );
    }
    out.push("");
  }

  return out.join("\n").trimEnd();
}

/** Render the chapter board overlay. */
function boardToMarkdown(board: NonNullable<WorkspaceBundleJson["chapterBoard"]>): string {
  if (!board.chapters.length) return "";
  const out: string[] = ["## Chapter Board", ""];
  for (const ch of board.chapters) {
    out.push(`### ${ch.title}${ch.notes ? ` — ${ch.notes}` : ""}`);
    for (const n of ch.nodes) {
      const ref = n.refTitle ?? n.refKey ?? n.refId ?? "(unknown)";
      out.push(`- (${n.kind}) ${ref} [tier ${n.tier}]`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** Full workspace bundle → one Markdown master plan. */
export function bundleToMarkdown(bundle: WorkspaceBundleJson): string {
  const parts = [
    "# Questline Master Plan",
    `_Exported ${(bundle.exportedAt ?? new Date().toISOString()).slice(0, 10)}_`,
    "",
    profileToMarkdown(bundle.profile),
  ];
  if (bundle.chapterBoard) {
    const board = boardToMarkdown(bundle.chapterBoard);
    if (board) parts.push("", board);
  }
  return parts.join("\n").trimEnd() + "\n";
}
