import "server-only";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import {
  epic,
  externalCalendarSource,
  externalEvent,
  milestone,
  quest,
  recurringBill,
  step,
  userPreference,
} from "@/server/db/schema";
import { buildVCalendar, type VEventInput } from "@/lib/ics";
import { scheduleSteps } from "@/lib/work-window";

/** YYYY-MM-DD → next day (all-day DTEND is exclusive per RFC 5545). */
function nextDayISO(iso: string): string {
  const [y, mm, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mm - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * POST /api/calendar/export
 *
 * Builds an .ics download on demand from a user-selected manifest.
 * Unlike the token-based subscription feed (which always includes
 * everything), this endpoint:
 *   - is auth'd via the Better-Auth session cookie (not the token)
 *   - takes a manifest of category-toggles + individual IDs
 *   - returns the .ics with Content-Disposition: attachment so the browser
 *     prompts a Save dialog
 */

const manifestSchema = z.object({
  // Top-level type toggles. When `false` for a kind, no events of that kind
  // are included regardless of `include`.
  enabled: z.object({
    milestones: z.boolean().default(true),
    steps: z.boolean().default(false),
    quests: z.boolean().default(true),
    sideQuests: z.boolean().default(true),
    bills: z.boolean().default(true),
    external: z.boolean().default(false),
  }),
  // Per-event allow-lists, scoped by kind. If a kind has its list empty AND
  // its toggle is true, that's interpreted as "include all of this kind".
  include: z.object({
    milestoneIds: z.array(z.string().uuid()).default([]),
    questIds: z.array(z.string().uuid()).default([]),
    billIds: z.array(z.string().uuid()).default([]),
    externalEventIds: z.array(z.string().uuid()).default([]),
  }),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("unauthorized", { status: 401 });
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const parsed = manifestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "validation", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const m = parsed.data;

  const events: VEventInput[] = [];

  // Milestones
  if (m.enabled.milestones) {
    const rows = await db.query.milestone.findMany({
      with: { epic: { columns: { title: true, userId: true } } },
    });
    const filtered = rows.filter(
      (r) =>
        r.epic.userId === userId &&
        r.estimatedAchievementDate &&
        (m.include.milestoneIds.length === 0 ||
          m.include.milestoneIds.includes(r.id)),
    );
    for (const r of filtered) {
      const hasSpan =
        !!r.estimatedStartDate &&
        r.estimatedStartDate < r.estimatedAchievementDate!;
      events.push({
        uid: `milestone-${r.id}@questline.local`,
        start: hasSpan ? r.estimatedStartDate! : r.estimatedAchievementDate!,
        end: hasSpan ? nextDayISO(r.estimatedAchievementDate!) : undefined,
        summary: `📌 ${r.title}`,
        description: `Epic: ${r.epic.title}\nTier ${r.tier}${hasSpan ? `\nPlanned: ${r.estimatedStartDate} → ${r.estimatedAchievementDate}` : ""}${r.description ? `\n${r.description}` : ""}`,
        categories: ["Milestone", r.epic.title],
      });
    }
  }

  // Steps → time blocks
  if (m.enabled.steps) {
    const prefs = await db.query.userPreference.findFirst({
      where: eq(userPreference.userId, userId),
    });
    if (prefs) {
      const milestones = await db.query.milestone.findMany({
        with: { epic: { columns: { userId: true } } },
      });
      const ownMilestoneIds = milestones
        .filter((mm) => mm.epic.userId === userId && mm.status !== "completed")
        .map((mm) => ({ id: mm.id, title: mm.title }));
      if (ownMilestoneIds.length > 0) {
        const steps = await db.query.step.findMany({
          where: and(
            inArray(
              step.milestoneId,
              ownMilestoneIds.map((mm) => mm.id),
            ),
            eq(step.isCompleted, false),
          ),
        });
        const titleByMilestone = new Map(
          ownMilestoneIds.map((mm) => [mm.id, mm.title]),
        );
        const blocks = scheduleSteps(
          {
            startHHMM: prefs.workWindowStart,
            endHHMM: prefs.workWindowEnd,
            daysMask: prefs.workWindowDays,
            defaultDurationMin: prefs.defaultStepDurationMin,
          },
          steps.map((s) => ({
            id: s.id,
            title: s.title,
            milestoneTitle: titleByMilestone.get(s.milestoneId) ?? "",
          })),
        );
        for (const b of blocks) {
          events.push({
            uid: `step-${b.stepId}@questline.local`,
            start: b.startsAt,
            end: b.endsAt,
            summary: `⚔ ${b.title}`,
            description: `Step of: ${b.milestoneTitle}`,
            categories: ["Step", b.milestoneTitle],
          });
        }
      }
    }
  }

  // Quests (daily/weekly recurring + one-off side quests)
  if (m.enabled.quests || m.enabled.sideQuests) {
    const rows = await db.query.quest.findMany({
      where: and(eq(quest.userId, userId), eq(quest.archived, false)),
      with: { skill: { columns: { name: true } } },
    });
    const today = new Date().toISOString().slice(0, 10);
    for (const q of rows) {
      const isSide = q.cadence === "one_off";
      if (isSide && !m.enabled.sideQuests) continue;
      if (!isSide && !m.enabled.quests) continue;
      if (
        m.include.questIds.length > 0 &&
        !m.include.questIds.includes(q.id)
      ) {
        continue;
      }
      if (isSide) {
        const date = q.expiresAt
          ? q.expiresAt.toISOString().slice(0, 10)
          : today;
        events.push({
          uid: `sidequest-${q.id}@questline.local`,
          start: date,
          summary: `❗ ${q.title}`,
          description: q.description ?? "",
          categories: ["Side Quest"],
        });
      } else {
        const rrule =
          q.cadence === "daily" ? "FREQ=DAILY" : "FREQ=WEEKLY;BYDAY=MO";
        events.push({
          uid: `quest-${q.id}@questline.local`,
          start: today,
          summary: `🎯 ${q.title}`,
          description: [
            q.description ?? "",
            q.skill ? `Grants +${q.xpReward} XP to ${q.skill.name}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          rrule,
          categories: ["Daily Quest"],
        });
      }
    }
  }

  // Bills
  if (m.enabled.bills) {
    const rows = await db.query.recurringBill.findMany({
      where: and(
        eq(recurringBill.userId, userId),
        eq(recurringBill.archived, false),
      ),
    });
    for (const b of rows) {
      if (!b.nextDueDate) continue;
      if (m.include.billIds.length > 0 && !m.include.billIds.includes(b.id)) {
        continue;
      }
      const rrule =
        b.cadence === "weekly"
          ? "FREQ=WEEKLY"
          : b.cadence === "yearly"
            ? "FREQ=YEARLY"
            : "FREQ=MONTHLY";
      events.push({
        uid: `bill-${b.id}@questline.local`,
        start: b.nextDueDate,
        summary: `💳 ${b.name} (${(b.amountCents / 100).toFixed(2)} ${b.currency})`,
        description: `${b.category} · ${b.cadence}`,
        rrule,
        categories: ["Bill", b.category],
      });
    }
  }

  // External imported events (mirror)
  if (m.enabled.external) {
    const sources = await db.query.externalCalendarSource.findMany({
      where: eq(externalCalendarSource.userId, userId),
      columns: { id: true, label: true },
    });
    if (sources.length > 0) {
      const ownSrcIds = new Set(sources.map((s) => s.id));
      const evs = await db.query.externalEvent.findMany();
      const sourceLabel = new Map(sources.map((s) => [s.id, s.label]));
      for (const ev of evs) {
        if (!ownSrcIds.has(ev.sourceId)) continue;
        if (
          m.include.externalEventIds.length > 0 &&
          !m.include.externalEventIds.includes(ev.id)
        ) {
          continue;
        }
        events.push({
          uid: `external-${ev.id}@questline.local`,
          start: ev.allDay
            ? ev.startsAt.toISOString().slice(0, 10)
            : ev.startsAt,
          end: ev.endsAt
            ? ev.allDay
              ? ev.endsAt.toISOString().slice(0, 10)
              : ev.endsAt
            : undefined,
          summary: `📅 ${ev.summary}`,
          description: `From: ${sourceLabel.get(ev.sourceId) ?? ""}`,
          categories: ["External", sourceLabel.get(ev.sourceId) ?? ""],
        });
      }
    }
  }

  const ics = buildVCalendar({
    name: "Questline Export",
    events,
    refreshInterval: "PT1H",
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="questline-${new Date().toISOString().slice(0, 10)}.ics"`,
      "X-Event-Count": String(events.length),
    },
  });
}
