import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { db as Db } from "@/server/db";
import { milestone, prerequisite } from "@/server/db/schema";

async function assertOwnsMilestone(
  ctx: { db: typeof Db; user: { id: string } },
  milestoneId: string,
) {
  const m = await ctx.db.query.milestone.findFirst({
    where: eq(milestone.id, milestoneId),
    with: { epic: true },
  });
  if (!m || m.epic.userId !== ctx.user.id) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const prerequisiteRouter = router({
  connect: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        requiredMilestoneId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.milestoneId === input.requiredMilestoneId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A milestone can't be its own prerequisite.",
        });
      }
      await assertOwnsMilestone(ctx, input.milestoneId);
      await assertOwnsMilestone(ctx, input.requiredMilestoneId);

      const [created] = await ctx.db
        .insert(prerequisite)
        .values({
          milestoneId: input.milestoneId,
          requiredMilestoneId: input.requiredMilestoneId,
        })
        .returning();
      return created;
    }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const p = await ctx.db.query.prerequisite.findFirst({
        where: eq(prerequisite.id, input.id),
        with: { milestone: { with: { epic: true } } },
      });
      if (!p || p.milestone.epic.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await ctx.db.delete(prerequisite).where(eq(prerequisite.id, input.id));
      return { success: true };
    }),
});
