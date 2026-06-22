import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  acceptProposals,
  acceptResourceRecommendations,
  breakDownEpic,
  draftRetrospective,
  formatRoadmapAsMarkdown,
  generateSideQuests,
  recommendResources,
  suggestScheduleAdjustments,
  weeklyCoach,
} from "@/lib/advisor";
import { milestone, quest } from "@/server/db/schema";
import { runForSurface } from "@/server/model-routing";

const proposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  tier: z.number().int().min(0).max(20),
  estimatedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  estimatedAchievementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const provenanceSchema = z.object({
  source: z.literal("ai_guide"),
  model: z.string().min(1).max(120),
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  responseTokens: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const advisorRouter = router({
  exportContext: protectedProcedure.query(async ({ ctx }) => {
    const markdown = await formatRoadmapAsMarkdown(ctx.user.id);
    return { markdown };
  }),

  breakDownEpic: protectedProcedure
    .input(z.object({ epicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await runForSurface(ctx.user.id, "breakdown", () =>
          breakDownEpic(ctx.user.id, input.epicId),
        );
      } catch (err) {
        if (err instanceof Error && err.message.includes("ANTHROPIC_API_KEY")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  acceptProposals: protectedProcedure
    .input(
      z.object({
        epicId: z.string().uuid(),
        proposals: z.array(proposalSchema).min(1).max(20),
        provenance: provenanceSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return acceptProposals(
        ctx.user.id,
        input.epicId,
        input.proposals,
        input.provenance,
      );
    }),

  // §4 — Schedule adjustment AI tool
  suggestScheduleAdjustments: protectedProcedure.mutation(async ({ ctx }) => {
    return runForSurface(ctx.user.id, "planning", () =>
      suggestScheduleAdjustments(ctx.user.id),
    );
  }),

  applyScheduleAdjustment: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(milestone)
        .set({
          estimatedAchievementDate: input.date,
          updatedAt: new Date(),
        })
        .where(eq(milestone.id, input.milestoneId));
      return { success: true };
    }),

  // §4 — Resource recommendation
  recommendResources: protectedProcedure
    .input(z.object({ milestoneId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return runForSurface(ctx.user.id, "planning", () =>
        recommendResources(ctx.user.id, input.milestoneId),
      );
    }),

  acceptResources: protectedProcedure
    .input(
      z.object({
        milestoneId: z.string().uuid(),
        picks: z
          .array(
            z.object({
              kind: z.string().min(1).max(40),
              label: z.string().min(1).max(200),
              url: z.string().url().optional(),
              notes: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return acceptResourceRecommendations(
        ctx.user.id,
        input.milestoneId,
        input.picks,
      );
    }),

  // §7 — Side quest generator
  generateSideQuests: protectedProcedure
    .input(z.object({ count: z.number().int().min(1).max(5).optional() }))
    .mutation(async ({ ctx, input }) => {
      return runForSurface(ctx.user.id, "planning", () =>
        generateSideQuests(ctx.user.id, input.count ?? 3),
      );
    }),

  acceptSideQuests: protectedProcedure
    .input(
      z.object({
        picks: z
          .array(
            z.object({
              title: z.string().min(1).max(120),
              description: z.string().max(500).optional(),
              difficulty: z.enum(["trivial", "normal", "hard"]),
              xpReward: z.number().int().min(0).max(1000),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = input.picks.map((p) => ({
        userId: ctx.user.id,
        title: p.title.trim(),
        description: p.description?.trim() || null,
        cadence: "one_off" as const,
        difficulty: p.difficulty,
        xpReward: p.xpReward,
        aiSuggested: true,
      }));
      const created = await ctx.db.insert(quest).values(rows).returning();
      return { created: created.length };
    }),

  // §10 — Save Point retrospective draft
  draftRetrospective: protectedProcedure
    .input(
      z.object({
        questsCompleted: z.number().int().nonnegative(),
        milestonesCompleted: z.number().int().nonnegative(),
        xpGained: z.number().int().nonnegative(),
        topSkill: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runForSurface(ctx.user.id, "coach", () =>
        draftRetrospective(input),
      );
    }),

  weeklyCoach: protectedProcedure.mutation(async ({ ctx }) => {
    return runForSurface(ctx.user.id, "coach", () => weeklyCoach(ctx.user.id));
  }),
});
