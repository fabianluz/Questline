import { z } from "zod";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { focusSession, skill } from "@/server/db/schema";

/** Minutes of focus per 1 XP awarded to the linked skill. */
const MIN_PER_XP = 5;

export const focusRouter = router({
  /** The currently-running session for this user, or null. */
  active: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.focusSession.findFirst({
      where: and(
        eq(focusSession.userId, ctx.user.id),
        isNull(focusSession.endedAt),
      ),
      orderBy: [desc(focusSession.startedAt)],
    });
    return row ?? null;
  }),

  /** Start a session. Any already-running session is stopped first. */
  start: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(200),
        refType: z.enum(["milestone", "step", "quest", "none"]).default("none"),
        refId: z.string().uuid().nullish(),
        skillId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Stop any running session so only one is active at a time.
      const running = await ctx.db.query.focusSession.findMany({
        where: and(
          eq(focusSession.userId, ctx.user.id),
          isNull(focusSession.endedAt),
        ),
      });
      for (const r of running) await stopSession(ctx.db, r);

      // Validate skill ownership if provided.
      let skillId: string | null = input.skillId ?? null;
      if (skillId) {
        const s = await ctx.db.query.skill.findFirst({
          where: and(eq(skill.id, skillId), eq(skill.userId, ctx.user.id)),
          columns: { id: true },
        });
        if (!s) skillId = null;
      }

      const [created] = await ctx.db
        .insert(focusSession)
        .values({
          userId: ctx.user.id,
          label: input.label,
          refType: input.refType,
          refId: input.refId ?? null,
          skillId,
        })
        .returning();
      return created;
    }),

  /** Stop the running session (or a specific one) and award XP. */
  stop: protectedProcedure
    .input(z.object({ id: z.string().uuid().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const row = input?.id
        ? await ctx.db.query.focusSession.findFirst({
            where: and(
              eq(focusSession.id, input.id),
              eq(focusSession.userId, ctx.user.id),
            ),
          })
        : await ctx.db.query.focusSession.findFirst({
            where: and(
              eq(focusSession.userId, ctx.user.id),
              isNull(focusSession.endedAt),
            ),
            orderBy: [desc(focusSession.startedAt)],
          });
      if (!row) return { stopped: false as const };
      const updated = await stopSession(ctx.db, row);
      return { stopped: true as const, session: updated };
    }),

  /** Abandon the running session without recording time/XP. */
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(focusSession)
      .where(
        and(eq(focusSession.userId, ctx.user.id), isNull(focusSession.endedAt)),
      );
    return { success: true };
  }),

  /** Completed sessions within a date range (inclusive, ISO datetimes). */
  listRange: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.focusSession.findMany({
        where: and(
          eq(focusSession.userId, ctx.user.id),
          gte(focusSession.startedAt, new Date(input.from)),
          lte(focusSession.startedAt, new Date(input.to)),
        ),
        orderBy: [desc(focusSession.startedAt)],
      });
    }),
});

/** Shared stop logic: compute minutes + XP, persist, return the row. */
async function stopSession(
  db: typeof import("@/server/db").db,
  row: typeof focusSession.$inferSelect,
) {
  const endedAt = new Date();
  const durationMin = Math.max(
    0,
    Math.round((endedAt.getTime() - row.startedAt.getTime()) / 60000),
  );
  const xpAwarded = row.skillId ? Math.round(durationMin / MIN_PER_XP) : 0;
  const [updated] = await db
    .update(focusSession)
    .set({ endedAt, durationMin, xpAwarded })
    .where(eq(focusSession.id, row.id))
    .returning();
  return updated;
}
