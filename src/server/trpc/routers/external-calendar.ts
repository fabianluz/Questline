import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { externalCalendarSource, externalEvent } from "@/server/db/schema";
import { parseIcs } from "@/lib/ics-parser";

export const externalCalendarRouter = router({
  listSources: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.query.externalCalendarSource.findMany({
      where: eq(externalCalendarSource.userId, ctx.user.id),
      orderBy: [desc(externalCalendarSource.lastImportedAt)],
    });
  }),

  /**
   * Accept the .ics body as a plain string. The dashboard uploader reads the
   * file in the browser and pipes its contents here — no multipart concerns,
   * and the body stays under the standard tRPC size cap for typical ICS files.
   */
  importIcs: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        content: z.string().min(20).max(2_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const events = parseIcs(input.content);
      if (events.length === 0) {
        return { eventCount: 0, sourceId: null };
      }

      // Upsert the source (one per (user, label) is the contract).
      const existing = await ctx.db.query.externalCalendarSource.findFirst({
        where: and(
          eq(externalCalendarSource.userId, ctx.user.id),
          eq(externalCalendarSource.label, input.label),
        ),
      });
      let source = existing;
      if (!source) {
        [source] = await ctx.db
          .insert(externalCalendarSource)
          .values({
            userId: ctx.user.id,
            label: input.label,
            color: input.color ?? "#6366f1",
            eventCount: events.length,
          })
          .returning();
      } else {
        [source] = await ctx.db
          .update(externalCalendarSource)
          .set({
            color: input.color ?? source.color,
            lastImportedAt: new Date(),
            eventCount: events.length,
          })
          .where(eq(externalCalendarSource.id, source.id))
          .returning();
      }

      for (const ev of events) {
        await ctx.db
          .insert(externalEvent)
          .values({
            sourceId: source.id,
            uid: ev.uid,
            summary: ev.summary,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt ?? null,
            allDay: ev.allDay,
          })
          .onConflictDoNothing();
      }

      return { eventCount: events.length, sourceId: source.id };
    }),

  deleteSource: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(externalCalendarSource)
        .where(
          and(
            eq(externalCalendarSource.id, input.id),
            eq(externalCalendarSource.userId, ctx.user.id),
          ),
        );
      return { success: true };
    }),

  listEvents: protectedProcedure
    .input(
      z.object({
        fromISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sources = await ctx.db.query.externalCalendarSource.findMany({
        where: eq(externalCalendarSource.userId, ctx.user.id),
        columns: { id: true, label: true, color: true },
      });
      if (sources.length === 0) return [];
      const sourceIds = sources.map((s) => s.id);
      const events = await ctx.db.query.externalEvent.findMany({
        where: and(
          gte(externalEvent.startsAt, new Date(input.fromISO)),
          lte(externalEvent.startsAt, new Date(input.toISO + "T23:59:59Z")),
        ),
      });
      const byId = new Map(sources.map((s) => [s.id, s]));
      return events
        .filter((e) => sourceIds.includes(e.sourceId))
        .map((e) => ({
          ...e,
          source: byId.get(e.sourceId)!,
        }));
    }),
});
