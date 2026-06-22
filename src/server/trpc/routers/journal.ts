import { z } from "zod";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { router, protectedProcedure } from "../trpc";
import {
  calendarBlock,
  dayBlockTemplate,
  dayPlan,
  epic,
  externalCalendarSource,
  externalEvent,
  milestone,
  quest,
  questCompletion,
  scheduleProfile,
  step,
  userPreference,
  type DayPlanBlock,
} from "@/server/db/schema";
import { planDay, draftDayJournal } from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";
import { buildVCalendar, type VEventInput } from "@/lib/ics";
import { resolveWindow, workSegments } from "@/lib/schedule";
import { packDay, type FixedBlock, type FlexItem } from "@/lib/day-plan";
import type { DB } from "@/server/db";

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const ISODATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const blockSchema = z.object({
  id: z.string(),
  start: HHMM,
  end: HHMM,
  title: z.string().min(1).max(200),
  kind: z.string().max(20),
  source: z.string().max(20),
  refId: z.string().nullish(),
  color: z.string().nullish(),
  note: z.string().max(500).nullish(),
  done: z.boolean().optional(),
});

/** Mon=0 … Sun=6 mask index for an ISO date. */
function maskIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Gather the day's planning inputs from ONE source of truth: the schedule
 * (work segments via resolveWindow, break carved out) + non-work recurring
 * day-blocks (gym, treatments…) as fixed anchors, plus today's quests and
 * due steps as flexible items. Shared by both the deterministic planner
 * (`plan`) and the AI optimizer (`generate`).
 */
async function gatherDay(db: DB, userId: string, date: string) {
  const idx = maskIndex(date);
  const [templates, schedProfiles, schedBlocks, prefs, dailyQuests, stepRows] =
    await Promise.all([
      db.query.dayBlockTemplate.findMany({ where: eq(dayBlockTemplate.userId, userId) }),
      db.query.scheduleProfile.findMany({ where: eq(scheduleProfile.userId, userId) }),
      db.query.calendarBlock.findMany({ where: eq(calendarBlock.userId, userId) }),
      db.query.userPreference.findFirst({
        where: eq(userPreference.userId, userId),
        columns: { workWindowStart: true, workWindowEnd: true, workWindowDays: true },
      }),
      db.query.quest.findMany({
        where: and(eq(quest.userId, userId), eq(quest.archived, false), eq(quest.cadence, "daily")),
        columns: { id: true, title: true },
      }),
      db
        .select({ title: step.title, minutes: step.estimatedMinutes })
        .from(step)
        .innerJoin(milestone, eq(step.milestoneId, milestone.id))
        .innerJoin(epic, eq(milestone.epicId, epic.id))
        .where(
          and(
            eq(epic.userId, userId),
            eq(step.isCompleted, false),
            isNotNull(step.dueDate),
            lte(step.dueDate, date),
            ne(milestone.status, "completed"),
          ),
        )
        .limit(8),
    ]);

  const todays = templates.filter((t) => t.daysMask.charAt(idx) === "1");
  const win = resolveWindow(date, {
    profiles: schedProfiles.map((p) => ({
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      breakStart: p.breakStart,
      breakEnd: p.breakEnd,
      days: p.days,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      priority: p.priority,
      active: p.active,
    })),
    blocks: schedBlocks.map((b) => ({
      title: b.title,
      startDate: b.startDate,
      endDate: b.endDate,
      blocksWork: b.blocksWork,
    })),
    fallback: prefs
      ? { startTime: prefs.workWindowStart, endTime: prefs.workWindowEnd, days: prefs.workWindowDays }
      : null,
  });

  // Work blocks come from the SCHEDULE (split around the break) — not from a
  // 'work' day-block template. Non-work, non-sleep templates stay as anchors.
  const workBlocks: FixedBlock[] = workSegments(win).map((seg, i) => ({
    label: win.label ? (workSegments(win).length > 1 ? `${win.label} (${i === 0 ? "AM" : "PM"})` : win.label) : "Work",
    start: seg.start,
    end: seg.end,
    kind: "work",
  }));
  const anchorBlocks: FixedBlock[] = todays
    .filter((t) => t.kind !== "sleep" && t.kind !== "work")
    .map((t) => ({ label: t.label, start: t.startHHMM, end: t.endHHMM, kind: t.kind }));
  const fixedBlocks = [...workBlocks, ...anchorBlocks];

  const sleep = todays.find((t) => t.kind === "sleep");
  const flexible: FlexItem[] = [
    ...dailyQuests.map((q) => ({ title: q.title, kind: "quest" as const })),
    ...stepRows.map((s) => ({ title: s.title, kind: "step" as const, minutes: s.minutes ?? undefined })),
  ];

  return {
    win,
    fixedBlocks,
    flexible,
    wake: sleep?.endHHMM ?? "07:00",
    sleepAt: sleep?.startHHMM ?? "23:00",
  };
}

export const journalRouter = router({
  // --- Recurring day-block templates ---------------------------------------
  templates: router({
    list: protectedProcedure.query(({ ctx }) =>
      ctx.db.query.dayBlockTemplate.findMany({
        where: eq(dayBlockTemplate.userId, ctx.user.id),
        orderBy: [asc(dayBlockTemplate.startHHMM)],
      }),
    ),

    upsert: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid().optional(),
          label: z.string().min(1).max(120),
          kind: z.enum(["work", "break", "fixed", "flex", "sleep"]),
          startHHMM: HHMM,
          endHHMM: HHMM,
          daysMask: z.string().regex(/^[01]{7}$/),
          color: z.string().nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.id) {
          const [u] = await ctx.db
            .update(dayBlockTemplate)
            .set({ ...input, updatedAt: new Date() })
            .where(
              and(
                eq(dayBlockTemplate.id, input.id),
                eq(dayBlockTemplate.userId, ctx.user.id),
              ),
            )
            .returning();
          return u;
        }
        const [c] = await ctx.db
          .insert(dayBlockTemplate)
          .values({ ...input, userId: ctx.user.id })
          .returning();
        return c;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db
          .delete(dayBlockTemplate)
          .where(
            and(
              eq(dayBlockTemplate.id, input.id),
              eq(dayBlockTemplate.userId, ctx.user.id),
            ),
          );
        return { success: true };
      }),

    /** One-time seed of a Work + Lunch block from the work-window preference. */
    seedFromWorkWindow: protectedProcedure.mutation(async ({ ctx }) => {
      const existing = await ctx.db.query.dayBlockTemplate.findFirst({
        where: eq(dayBlockTemplate.userId, ctx.user.id),
        columns: { id: true },
      });
      if (existing) return { seeded: 0 };
      const prefs = await ctx.db.query.userPreference.findFirst({
        where: eq(userPreference.userId, ctx.user.id),
      });
      const start = prefs?.workWindowStart ?? "09:00";
      const end = prefs?.workWindowEnd ?? "17:00";
      const days = prefs?.workWindowDays ?? "1111100";
      await ctx.db.insert(dayBlockTemplate).values([
        {
          userId: ctx.user.id,
          label: "Work",
          kind: "work",
          startHHMM: start,
          endHHMM: end,
          daysMask: days,
          color: "#4a90e2",
          sortOrder: 0,
        },
        {
          userId: ctx.user.id,
          label: "Lunch",
          kind: "break",
          startHHMM: "14:00",
          endHHMM: "15:00",
          daysMask: days,
          color: "#7ed321",
          sortOrder: 1,
        },
      ]);
      return { seeded: 2 };
    }),
  }),

  // --- Per-day plan ---------------------------------------------------------
  /** The saved plan for a date + the raw inputs that feed the planner. */
  get: protectedProcedure
    .input(z.object({ date: ISODATE }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const idx = maskIndex(input.date);

      const allTemplates = await ctx.db.query.dayBlockTemplate.findMany({
        where: eq(dayBlockTemplate.userId, userId),
        orderBy: [asc(dayBlockTemplate.startHHMM)],
      });
      const templates = allTemplates.filter((t) => t.daysMask.charAt(idx) === "1");

      // Daily quests not yet completed for this date.
      const dailyQuests = await ctx.db.query.quest.findMany({
        where: and(
          eq(quest.userId, userId),
          eq(quest.archived, false),
          eq(quest.cadence, "daily"),
        ),
        columns: { id: true, title: true, skillId: true },
      });
      const completedToday = dailyQuests.length
        ? await ctx.db.query.questCompletion.findMany({
            where: and(
              inArray(
                questCompletion.questId,
                dailyQuests.map((q) => q.id),
              ),
              eq(questCompletion.completedFor, input.date),
            ),
            columns: { questId: true },
          })
        : [];
      const doneSet = new Set(completedToday.map((c) => c.questId));
      const quests = dailyQuests
        .filter((q) => !doneSet.has(q.id))
        .map((q) => ({ id: q.id, title: q.title, skillId: q.skillId }));

      // Steps due on/before this date, not completed.
      const stepRows = await ctx.db
        .select({ id: step.id, title: step.title, milestone: milestone.title })
        .from(step)
        .innerJoin(milestone, eq(step.milestoneId, milestone.id))
        .innerJoin(epic, eq(milestone.epicId, epic.id))
        .where(
          and(
            eq(epic.userId, userId),
            eq(step.isCompleted, false),
            isNotNull(step.dueDate),
            lte(step.dueDate, input.date),
            ne(milestone.status, "completed"),
          ),
        )
        .limit(12);

      // External calendar events that touch this date.
      const dayStart = new Date(`${input.date}T00:00:00`);
      const dayEnd = new Date(`${input.date}T23:59:59`);
      const sources = await ctx.db.query.externalCalendarSource.findMany({
        where: eq(externalCalendarSource.userId, userId),
        columns: { id: true },
      });
      const external = sources.length
        ? (
            await ctx.db.query.externalEvent.findMany({
              where: and(
                inArray(
                  externalEvent.sourceId,
                  sources.map((s) => s.id),
                ),
                gte(externalEvent.startsAt, dayStart),
                lte(externalEvent.startsAt, dayEnd),
              ),
            })
          ).map((e) => ({
            summary: e.summary,
            start: hhmm(e.startsAt),
            end: e.endsAt ? hhmm(e.endsAt) : hhmm(e.startsAt),
          }))
        : [];

      const plan = await ctx.db.query.dayPlan.findFirst({
        where: and(eq(dayPlan.userId, userId), eq(dayPlan.date, input.date)),
      });

      return {
        plan: plan ?? null,
        inputs: { templates, quests, steps: stepRows, external },
        hasTemplates: allTemplates.length > 0,
      };
    }),

  /** Run the AI planner for a date and persist the result. */
  /**
   * Deterministic day plan (default) — instant, offline, schedule-driven.
   * Work blocks come from your schedule (split around the break); your daily
   * quests + due steps pack into the gaps. No AI needed.
   */
  plan: protectedProcedure
    .input(z.object({ date: ISODATE }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { fixedBlocks, flexible, wake, sleepAt } = await gatherDay(ctx.db, userId, input.date);

      const planned = packDay({ wake, sleep: sleepAt, fixed: fixedBlocks, flexible });
      const dayBlocks: DayPlanBlock[] = planned.map((b) => ({
        id: randomUUID(),
        start: b.start,
        end: b.end,
        title: b.title,
        kind: b.kind as DayPlanBlock["kind"],
        source: b.source as DayPlanBlock["source"],
        done: false,
      }));

      const [saved] = await ctx.db
        .insert(dayPlan)
        .values({ userId, date: input.date, blocks: dayBlocks, model: "deterministic" })
        .onConflictDoUpdate({
          target: [dayPlan.userId, dayPlan.date],
          set: { blocks: dayBlocks, model: "deterministic", updatedAt: new Date() },
        })
        .returning();
      return saved;
    }),

  /** AI optimizer — same inputs, but the local model arranges the day. */
  generate: protectedProcedure
    .input(z.object({ date: ISODATE }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { fixedBlocks, flexible, wake, sleepAt } = await gatherDay(ctx.db, userId, input.date);

      const { blocks, model } = await runForSurface(ctx.user.id, "planning", () =>
        planDay({
          dateLabel: input.date,
          wakeHHMM: wake,
          sleepHHMM: sleepAt,
          fixed: fixedBlocks,
          flexible,
          external: [],
        }),
      );

      const dayBlocks: DayPlanBlock[] = blocks.map((b) => ({
        id: randomUUID(),
        start: b.start,
        end: b.end,
        title: b.title,
        kind: b.kind as DayPlanBlock["kind"],
        source: b.source as DayPlanBlock["source"],
        done: false,
      }));

      const [saved] = await ctx.db
        .insert(dayPlan)
        .values({ userId, date: input.date, blocks: dayBlocks, model })
        .onConflictDoUpdate({
          target: [dayPlan.userId, dayPlan.date],
          set: { blocks: dayBlocks, model, updatedAt: new Date() },
        })
        .returning();
      return saved;
    }),

  /** Persist user edits/moves to the timeline. */
  save: protectedProcedure
    .input(z.object({ date: ISODATE, blocks: z.array(blockSchema) }))
    .mutation(async ({ ctx, input }) => {
      const blocks = input.blocks as DayPlanBlock[];
      const [saved] = await ctx.db
        .insert(dayPlan)
        .values({ userId: ctx.user.id, date: input.date, blocks })
        .onConflictDoUpdate({
          target: [dayPlan.userId, dayPlan.date],
          set: { blocks, updatedAt: new Date() },
        })
        .returning();
      return saved;
    }),

  /** AI-draft the day's journal markdown from the saved plan. */
  generateJournal: protectedProcedure
    .input(z.object({ date: ISODATE }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.query.dayPlan.findFirst({
        where: and(
          eq(dayPlan.userId, ctx.user.id),
          eq(dayPlan.date, input.date),
        ),
      });
      const blocks = plan?.blocks ?? [];
      const { text } = await runForSurface(ctx.user.id, "planning", () =>
        draftDayJournal({
          dateLabel: input.date,
          blocks: blocks.map((b) => ({
            start: b.start,
            end: b.end,
            title: b.title,
            kind: b.kind,
            done: b.done,
          })),
        }),
      );
      await ctx.db
        .insert(dayPlan)
        .values({ userId: ctx.user.id, date: input.date, blocks, journalText: text })
        .onConflictDoUpdate({
          target: [dayPlan.userId, dayPlan.date],
          set: { journalText: text, updatedAt: new Date() },
        });
      return { journalText: text };
    }),

  /** Build an .ics for the day's blocks (timed events at local wall-clock). */
  toIcs: protectedProcedure
    .input(z.object({ date: ISODATE }))
    .query(async ({ ctx, input }) => {
      const plan = await ctx.db.query.dayPlan.findFirst({
        where: and(
          eq(dayPlan.userId, ctx.user.id),
          eq(dayPlan.date, input.date),
        ),
      });
      const blocks = plan?.blocks ?? [];
      const [y, mo, d] = input.date.split("-").map(Number);
      const events: VEventInput[] = blocks.map((b, i) => {
        const [sh, sm] = b.start.split(":").map(Number);
        const [eh, em] = b.end.split(":").map(Number);
        const start = new Date(y, mo - 1, d, sh, sm, 0);
        const end = new Date(y, mo - 1, d, eh, em, 0);
        if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
        return {
          uid: `dayplan-${input.date}-${i}@questline.local`,
          start,
          end,
          summary: b.title,
          categories: ["Questline", b.kind],
        };
      });
      return {
        filename: `questline-day-${input.date}.ics`,
        ics: buildVCalendar({ name: `Questline — ${input.date}`, events }),
      };
    }),
});
