import { z } from "zod";
import { and, eq, max } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { epic, milestone, milestoneSkill, skill } from "@/server/db/schema";

async function assertOwnsMilestone(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  milestoneId: string,
) {
  const m = await ctx.db.query.milestone.findFirst({
    where: eq(milestone.id, milestoneId),
    with: { epic: true },
  });
  if (!m || m.epic.userId !== ctx.user.id) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return m;
}

async function nextPositionInTier(
  ctx: { db: typeof import("@/server/db").db },
  epicId: string,
  tier: number,
) {
  const [row] = await ctx.db
    .select({ value: max(milestone.position) })
    .from(milestone)
    .where(and(eq(milestone.epicId, epicId), eq(milestone.tier, tier)));
  return (row?.value ?? -1) + 1;
}

export const milestoneRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        epicId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        estimatedStartDate: z.string().optional(),
        estimatedAchievementDate: z.string().optional(),
        estimatedHours: z.number().int().min(0).max(100000).nullish(),
        tier: z.number().int().min(0).max(50).optional(),
        position: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parent = await ctx.db.query.epic.findFirst({
        where: and(eq(epic.id, input.epicId), eq(epic.userId, ctx.user.id)),
      });
      if (!parent) throw new TRPCError({ code: "FORBIDDEN" });

      const tier = input.tier ?? 0;
      const position =
        input.position ?? (await nextPositionInTier(ctx, input.epicId, tier));

      const [created] = await ctx.db
        .insert(milestone)
        .values({
          epicId: input.epicId,
          title: input.title,
          description: input.description,
          estimatedStartDate: input.estimatedStartDate,
          estimatedAchievementDate: input.estimatedAchievementDate,
          estimatedHours: input.estimatedHours ?? null,
          tier,
          position,
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
        tier: z.number().int().min(0).max(50).optional(),
        position: z.number().int().min(0).optional(),
        estimatedStartDate: z.string().nullish(),
        estimatedAchievementDate: z.string().nullish(),
        estimatedHours: z.number().int().min(0).max(100000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = await assertOwnsMilestone(ctx, input.id);
      const { id, ...rest } = input;

      // If tier moved and caller didn't pin a position, slot into the next free spot.
      let nextPosition = rest.position;
      if (
        rest.tier !== undefined &&
        rest.tier !== current.tier &&
        nextPosition === undefined
      ) {
        nextPosition = await nextPositionInTier(ctx, current.epicId, rest.tier);
      }

      const [updated] = await ctx.db
        .update(milestone)
        .set({
          ...rest,
          ...(nextPosition !== undefined ? { position: nextPosition } : {}),
          updatedAt: new Date(),
        })
        .where(eq(milestone.id, id))
        .returning();
      return updated;
    }),

  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const current = await assertOwnsMilestone(ctx, input.id);
      const isDone = current.status === "completed";
      const [updated] = await ctx.db
        .update(milestone)
        .set({
          status: isDone ? "in_progress" : "completed",
          completedAt: isDone ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(milestone.id, input.id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsMilestone(ctx, input.id);
      await ctx.db.delete(milestone).where(eq(milestone.id, input.id));
      return { success: true };
    }),

  linkSkill: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        skillId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsMilestone(ctx, input.milestoneId);
      const s = await ctx.db.query.skill.findFirst({
        where: and(
          eq(skill.id, input.skillId),
          eq(skill.userId, ctx.user.id),
        ),
      });
      if (!s) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }
      // Idempotent: ignore duplicates on the composite PK.
      await ctx.db
        .insert(milestoneSkill)
        .values({
          milestoneId: input.milestoneId,
          skillId: input.skillId,
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  unlinkSkill: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        skillId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsMilestone(ctx, input.milestoneId);
      await ctx.db
        .delete(milestoneSkill)
        .where(
          and(
            eq(milestoneSkill.milestoneId, input.milestoneId),
            eq(milestoneSkill.skillId, input.skillId),
          ),
        );
      return { success: true };
    }),
});
