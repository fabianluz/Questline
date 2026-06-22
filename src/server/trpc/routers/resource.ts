import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { resource } from "@/server/db/schema";

export const resourceRouter = router({
  toggleAcquired: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.query.resource.findFirst({
        where: eq(resource.id, input.id),
        with: { milestone: { with: { epic: true } } },
      });
      if (!current || current.milestone.epic.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const wasAcquired = current.acquired;
      const [updated] = await ctx.db
        .update(resource)
        .set({
          acquired: !wasAcquired,
          acquiredAt: wasAcquired ? null : new Date(),
        })
        .where(eq(resource.id, input.id))
        .returning();
      return updated;
    }),
});
