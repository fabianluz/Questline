import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { milestone, step } from "@/server/db/schema";

/**
 * Ownership guard: a step belongs to the current user iff its milestone's
 * epic is theirs. Returns the loaded step (with milestone) for reuse.
 */
async function assertOwnsStep(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  stepId: string,
) {
  const current = await ctx.db.query.step.findFirst({
    where: eq(step.id, stepId),
    with: { milestone: { with: { epic: { columns: { userId: true } } } } },
  });
  if (!current || current.milestone.epic.userId !== ctx.user.id) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return current;
}

export const stepRouter = router({
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const current = await assertOwnsStep(ctx, input.id);
      const wasDone = current.isCompleted;
      const [updated] = await ctx.db
        .update(step)
        .set({
          isCompleted: !wasDone,
          completedAt: wasDone ? null : new Date(),
        })
        .where(eq(step.id, input.id))
        .returning();
      return updated;
    }),

  create: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
        dueDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure the parent milestone belongs to the user.
      const parent = await ctx.db.query.milestone.findFirst({
        where: eq(milestone.id, input.milestoneId),
        with: { epic: { columns: { userId: true } } },
      });
      if (!parent || parent.epic.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Append at the end.
      const peers = await ctx.db.query.step.findMany({
        where: eq(step.milestoneId, input.milestoneId),
        columns: { position: true },
        orderBy: [asc(step.position)],
      });
      const nextPos =
        peers.length === 0 ? 0 : Math.max(...peers.map((p) => p.position)) + 1;
      const [created] = await ctx.db
        .insert(step)
        .values({
          milestoneId: input.milestoneId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          dueDate: input.dueDate || null,
          position: nextPos,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(500).nullish(),
        // nullish so the per-step deadline can be set AND cleared.
        dueDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsStep(ctx, input.id);
      const { id, ...updates } = input;
      if (updates.dueDate === "") updates.dueDate = null;
      if (typeof updates.title === "string") updates.title = updates.title.trim();
      const [updated] = await ctx.db
        .update(step)
        .set(updates)
        .where(eq(step.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsStep(ctx, input.id);
      await ctx.db.delete(step).where(eq(step.id, input.id));
      return { success: true };
    }),
});
