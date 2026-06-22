import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { epic } from "@/server/db/schema";

const statusEnum = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "paused",
  "abandoned",
]);

export const epicRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.epic.findMany({
      where: eq(epic.userId, ctx.user.id),
      orderBy: [desc(epic.createdAt)],
      with: {
        category: true,
        milestones: true,
      },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.query.epic.findFirst({
        where: and(eq(epic.id, input.id), eq(epic.userId, ctx.user.id)),
        with: {
          category: true,
          milestones: {
            with: {
              steps: true,
              resources: true,
              skills: { with: { skill: true } },
            },
          },
        },
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        targetDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(epic)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          targetDate: input.targetDate,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        status: statusEnum.optional(),
        // nullish so the deadline can be CLEARED (send null) as well as set.
        targetDate: z.string().nullish(),
        categoryId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      // Empty string from a <input type="date"> means "no date" → null.
      if (updates.targetDate === "") updates.targetDate = null;
      const [updated] = await ctx.db
        .update(epic)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(epic.id, id), eq(epic.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(epic)
        .where(and(eq(epic.id, input.id), eq(epic.userId, ctx.user.id)));
      return { success: true };
    }),
});
