import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  calendarBlock,
  calendarFeed,
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

export const dynamic = "force-dynamic";
const WEBCAL_REFRESH = "PT1H";

/** YYYY-MM-DD → next day (for all-day DTEND, which is exclusive per RFC 5545). */
function nextDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return new Response("Not found", { status: 404 });
  }
  const feed = await db.query.calendarFeed.findFirst({
    where: eq(calendarFeed.token, token),
  });
  if (!feed) return new Response("Not found", { status: 404 });
  const userId = feed.userId;

  const [milestones, quests, bills, calBlocks, prefs, sources, extEvents] =
    await Promise.all([
      db.query.milestone.findMany({
        where: isNotNull(milestone.estimatedAchievementDate),
        with: {
          epic: { columns: { title: true, userId: true } },
          steps: { columns: { id: true, title: true, isCompleted: true } },
        },
      }),
      db.query.quest.findMany({
        where: and(eq(quest.userId, userId), eq(quest.archived, false)),
        with: { skill: { columns: { name: true } } },
      }),
      db.query.recurringBill.findMany({
        where: and(
          eq(recurringBill.userId, userId),
          eq(recurringBill.archived, false),
        ),
      }),
      db.query.calendarBlock.findMany({
        where: eq(calendarBlock.userId, userId),
      }),
      db.query.userPreference.findFirst({
        where: eq(userPreference.userId, userId),
      }),
      db.query.externalCalendarSource.findMany({
        where: eq(externalCalendarSource.userId, userId),
      }),
      // Pull external events from this user's sources, last 30d..future
      (async () => {
        const userSources = await db.query.externalCalendarSource.findMany({
          where: eq(externalCalendarSource.userId, userId),
          columns: { id: true },
        });
        if (userSources.length === 0) return [];
        return await db.query.externalEvent.findMany({
          orderBy: (t, { asc }) => [asc(t.startsAt)],
        });
      })(),
    ]);

  const ownMilestones = milestones.filter(
    (m) => m.epic.userId === userId && m.estimatedAchievementDate,
  );

  const events: VEventInput[] = [];

  // --- Milestones (all-day) ---
  // When a milestone has a planned start date it spans start → achievement
  // (DTEND is exclusive, so we push it to the day after the deadline).
  for (const m of ownMilestones) {
    const hasSpan =
      !!m.estimatedStartDate &&
      m.estimatedStartDate < m.estimatedAchievementDate!;
    events.push({
      uid: `milestone-${m.id}@questline.local`,
      start: hasSpan ? m.estimatedStartDate! : m.estimatedAchievementDate!,
      end: hasSpan ? nextDayISO(m.estimatedAchievementDate!) : undefined,
      summary: `📌 ${m.title}`,
      description: [
        `Epic: ${m.epic.title}`,
        `Tier ${m.tier}`,
        hasSpan
          ? `Planned window: ${m.estimatedStartDate} → ${m.estimatedAchievementDate}`
          : `Target: ${m.estimatedAchievementDate}`,
        m.description ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      categories: ["Milestone", m.epic.title],
    });
  }

  // --- §5 Steps → daily time-blocks ---
  // Take all incomplete steps under non-completed user milestones, allocate
  // them into the user's work window starting today.
  const stepsToBlock: Array<{
    id: string;
    title: string;
    milestoneTitle: string;
  }> = [];
  for (const m of ownMilestones) {
    if (m.status === "completed") continue;
    for (const s of m.steps) {
      if (s.isCompleted) continue;
      stepsToBlock.push({
        id: s.id,
        title: s.title,
        milestoneTitle: m.title,
      });
    }
  }
  if (stepsToBlock.length > 0 && prefs) {
    const window = {
      startHHMM: prefs.workWindowStart,
      endHHMM: prefs.workWindowEnd,
      daysMask: prefs.workWindowDays,
      defaultDurationMin: prefs.defaultStepDurationMin,
    };
    const blocks = scheduleSteps(window, stepsToBlock);
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

  // --- Quests ---
  for (const q of quests) {
    const today = new Date().toISOString().slice(0, 10);
    if (q.cadence === "one_off") {
      // Show side quest on its expiry date (or today if no expiry).
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
      continue;
    }
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

  // --- Bills ---
  for (const b of bills) {
    if (!b.nextDueDate) continue;
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

  // --- Calendar blocks (holidays / time off / travel) ---
  const blockIcon: Record<string, string> = {
    holiday: "🏖️",
    time_off: "🌙",
    travel: "✈️",
    focus: "🎯",
    busy: "⛔",
    custom: "🗓️",
  };
  for (const b of calBlocks) {
    const icon = blockIcon[b.kind] ?? "🗓️";
    events.push({
      uid: `block-${b.id}@questline.local`,
      // All-day span; DTEND is exclusive so push to the day after endDate.
      start: b.startDate,
      end: nextDayISO(b.endDate),
      summary: `${icon} ${b.title}${b.blocksWork ? " (no work)" : ""}`,
      description: [b.kind, b.notes ?? ""].filter(Boolean).join("\n"),
      categories: ["Time Block", b.kind],
    });
  }

  // --- External events (read-only mirror of imported calendars) ---
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  for (const ev of extEvents) {
    const src = sourceById.get(ev.sourceId);
    if (!src) continue; // belongs to another user
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
      description: `From: ${src.label}`,
      categories: ["External", src.label],
    });
  }

  const ics = buildVCalendar({
    name: "Questline",
    events,
    refreshInterval: WEBCAL_REFRESH,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="questline.ics"',
    },
  });
}
