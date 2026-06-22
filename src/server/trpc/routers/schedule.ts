import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import {
  calendarBlock,
  epic,
  scheduleProfile,
  userPreference,
} from "@/server/db/schema";
import { SchedulePeriodJson, CalendarBlockJson } from "@/lib/json-shapes";
import { resolveWindow } from "@/lib/schedule";
import {
  computeCapacity,
  addDaysISO,
  type CalendarBlockInput,
  type ScheduleProfileInput,
  type WorkWindowFallback,
} from "@/lib/capacity";
import { todayUTC } from "@/lib/quest-periods";

type Ctx = { db: typeof import("@/server/db").db; user: { id: string } };

/** Load the user's schedule inputs (profiles + blocks + legacy fallback). */
async function loadScheduleInputs(ctx: Ctx): Promise<{
  profiles: ScheduleProfileInput[];
  blocks: CalendarBlockInput[];
  fallback: WorkWindowFallback | null;
}> {
  const [profiles, blocks, prefs] = await Promise.all([
    ctx.db.query.scheduleProfile.findMany({
      where: eq(scheduleProfile.userId, ctx.user.id),
    }),
    ctx.db.query.calendarBlock.findMany({
      where: eq(calendarBlock.userId, ctx.user.id),
    }),
    ctx.db.query.userPreference.findFirst({
      where: eq(userPreference.userId, ctx.user.id),
      columns: { workWindowStart: true, workWindowEnd: true, workWindowDays: true },
    }),
  ]);
  return {
    profiles: profiles.map((p) => ({
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
    blocks: blocks.map((b) => ({
      title: b.title,
      startDate: b.startDate,
      endDate: b.endDate,
      blocksWork: b.blocksWork,
    })),
    fallback: prefs
      ? { startTime: prefs.workWindowStart, endTime: prefs.workWindowEnd, days: prefs.workWindowDays }
      : null,
  };
}

/**
 * Time-block scheduling (Planning v2, Phase 2). CRUD for recurring schedule
 * profiles + one-off calendar blocks, plus `windowFor` which runs the pure
 * resolver (block → profile → legacy workWindow) for a given date.
 */
export const scheduleRouter = router({
  // ── Schedule profiles ──────────────────────────────────────────────────
  listProfiles: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.scheduleProfile.findMany({
      where: eq(scheduleProfile.userId, ctx.user.id),
      orderBy: [asc(scheduleProfile.priority), asc(scheduleProfile.name)],
    }),
  ),

  createProfile: protectedProcedure
    .input(SchedulePeriodJson)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(scheduleProfile)
        .values({
          userId: ctx.user.id,
          key: input.key ?? null,
          name: input.name,
          startTime: input.startTime,
          endTime: input.endTime,
          breakStart: input.breakStart ?? null,
          breakEnd: input.breakEnd ?? null,
          days: input.days,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          color: input.color ?? null,
          priority: input.priority,
          active: input.active,
          notes: input.notes ?? null,
        })
        .returning();
      return row;
    }),

  updateProfile: protectedProcedure
    .input(z.object({ id: z.string().uuid(), patch: SchedulePeriodJson.partial() }))
    .mutation(async ({ ctx, input }) => {
      const { patch } = input;
      await ctx.db
        .update(scheduleProfile)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
          ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
          ...(patch.breakStart !== undefined ? { breakStart: patch.breakStart } : {}),
          ...(patch.breakEnd !== undefined ? { breakEnd: patch.breakEnd } : {}),
          ...(patch.days !== undefined ? { days: patch.days } : {}),
          ...(patch.effectiveFrom !== undefined ? { effectiveFrom: patch.effectiveFrom } : {}),
          ...(patch.effectiveTo !== undefined ? { effectiveTo: patch.effectiveTo } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(scheduleProfile.id, input.id), eq(scheduleProfile.userId, ctx.user.id)));
      return { ok: true };
    }),

  deleteProfile: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(scheduleProfile)
        .where(and(eq(scheduleProfile.id, input.id), eq(scheduleProfile.userId, ctx.user.id)));
      return { ok: true };
    }),

  // ── Calendar blocks ────────────────────────────────────────────────────
  listBlocks: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.calendarBlock.findMany({
      where: eq(calendarBlock.userId, ctx.user.id),
      orderBy: [asc(calendarBlock.startDate)],
    }),
  ),

  createBlock: protectedProcedure
    .input(CalendarBlockJson)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(calendarBlock)
        .values({
          userId: ctx.user.id,
          key: input.key ?? null,
          title: input.title,
          kind: input.kind,
          startDate: input.startDate,
          endDate: input.endDate,
          allDay: input.allDay,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          blocksWork: input.blocksWork,
          color: input.color ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return row;
    }),

  updateBlock: protectedProcedure
    .input(z.object({ id: z.string().uuid(), patch: CalendarBlockJson.partial() }))
    .mutation(async ({ ctx, input }) => {
      const { patch } = input;
      await ctx.db
        .update(calendarBlock)
        .set({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
          ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
          ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
          ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
          ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
          ...(patch.blocksWork !== undefined ? { blocksWork: patch.blocksWork } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(calendarBlock.id, input.id), eq(calendarBlock.userId, ctx.user.id)));
      return { ok: true };
    }),

  deleteBlock: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(calendarBlock)
        .where(and(eq(calendarBlock.id, input.id), eq(calendarBlock.userId, ctx.user.id)));
      return { ok: true };
    }),

  // ── Resolver ───────────────────────────────────────────────────────────
  /** What's the effective work window on `date` (YYYY-MM-DD)? */
  windowFor: protectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const { profiles, blocks, fallback } = await loadScheduleInputs(ctx);
      return resolveWindow(input.date, { profiles, blocks, fallback });
    }),

  // ── Capacity (Phase 5) ─────────────────────────────────────────────────
  /**
   * Available goal-hours (schedule-aware) vs planned milestone load over a
   * window, with weekly/monthly buckets + overload flags. Pure math in
   * lib/capacity.ts; this just gathers the inputs.
   */
  capacity: protectedProcedure
    .input(
      z
        .object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          weeks: z.number().int().min(1).max(52).optional(),
          dailyCapHours: z.number().min(0).max(24).optional(),
          offDayCapHours: z.number().min(0).max(24).optional(),
          holidayCapHours: z.number().min(0).max(24).optional(),
          bucketBy: z.enum(["week", "month"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const from = input?.from ?? todayUTC();
      const to = input?.to ?? addDaysISO(from, (input?.weeks ?? 12) * 7 - 1);

      const [{ profiles, blocks, fallback }, epics] = await Promise.all([
        loadScheduleInputs(ctx),
        ctx.db.query.epic.findMany({
          where: eq(epic.userId, ctx.user.id),
          columns: { id: true, title: true },
          with: {
            milestones: {
              columns: {
                id: true,
                title: true,
                status: true,
                estimatedHours: true,
                estimatedStartDate: true,
                estimatedAchievementDate: true,
              },
            },
          },
        }),
      ]);

      const items = epics.flatMap((e) =>
        e.milestones
          .filter((m) => (m.estimatedHours ?? 0) > 0 && m.status !== "completed")
          .map((m) => ({
            id: m.id,
            label: m.title,
            epic: e.title,
            estimatedHours: m.estimatedHours ?? 0,
            startDate: m.estimatedStartDate,
            endDate: m.estimatedAchievementDate,
          })),
      );

      return computeCapacity({
        from,
        to,
        profiles,
        blocks,
        fallback,
        items,
        dailyCapHours: input?.dailyCapHours ?? 2,
        offDayCapHours: input?.offDayCapHours,
        holidayCapHours: input?.holidayCapHours,
        bucketBy: input?.bucketBy ?? "week",
      });
    }),
});
