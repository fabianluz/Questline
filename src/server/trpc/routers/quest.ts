import { z } from "zod";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { quest, questCompletion, skill } from "@/server/db/schema";
import { periodFor, streakFor, todayUTC, type Cadence } from "@/lib/quest-periods";

const cadenceSchema = z.enum(["daily", "weekly", "one_off"]);
const difficultySchema = z.enum(["trivial", "normal", "hard"]);

const isoDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const baseInput = {
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  cadence: cadenceSchema,
  xpReward: z.number().int().min(0).max(1000),
  skillId: z.string().uuid().nullish(),
  difficulty: difficultySchema.nullish(),
  expiresAt: z.date().nullish(),
  aiSuggested: z.boolean().optional(),
  // Planning v2 — active window + per-period target for recurring quests.
  startDate: isoDateStr.nullish(),
  endDate: isoDateStr.nullish(),
  timesPerPeriod: z.number().int().min(1).max(100).nullish(),
};

// §7 — XP defaults for one-off side quests, by difficulty.
export const SIDE_QUEST_XP: Record<"trivial" | "normal" | "hard", number> = {
  trivial: 5,
  normal: 15,
  hard: 40,
};

// 90 days is plenty for streak math; trims memory on very-old accounts.
const COMPLETION_LOOKBACK_DAYS = 90;

function lookbackCutoff(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - COMPLETION_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

export const questRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const cutoff = lookbackCutoff();
    const rows = await ctx.db.query.quest.findMany({
      where: and(eq(quest.userId, ctx.user.id), eq(quest.archived, false)),
      with: {
        skill: { columns: { id: true, name: true } },
        completions: {
          where: gte(questCompletion.completedFor, cutoff),
          orderBy: [desc(questCompletion.completedFor)],
        },
      },
      orderBy: [asc(quest.cadence), asc(quest.title)],
    });

    // Planning v2: hide quests outside their active window (e.g. a habit that
    // doesn't start until 13 Jul, or one whose end date has passed).
    const today = todayUTC();
    const inWindow = rows.filter(
      (q) =>
        (!q.startDate || q.startDate <= today) &&
        (!q.endDate || q.endDate >= today),
    );

    return inWindow.map((q) => {
      // One-off side quests have no streak / period semantics. They're
      // "completed" or "not", with the completion stored as a single row
      // dated whenever the user clicked done.
      if (q.cadence === "one_off") {
        const completed = q.completions.length > 0;
        return {
          id: q.id,
          title: q.title,
          description: q.description,
          cadence: "one_off" as const,
          xpReward: q.xpReward,
          difficulty: q.difficulty,
          expiresAt: q.expiresAt,
          aiSuggested: q.aiSuggested,
          skill: q.skill ? { id: q.skill.id, name: q.skill.name } : null,
          completedThisPeriod: completed,
          currentPeriod: q.completions[0]?.completedFor ?? null,
          streak: 0,
          completionsInWindow: q.completions.length,
          startDate: q.startDate,
          endDate: q.endDate,
          timesPerPeriod: q.timesPerPeriod,
        };
      }
      const cadence = q.cadence as Cadence;
      const dates = new Set(q.completions.map((c) => c.completedFor));
      const currentPeriod = periodFor(cadence);
      return {
        id: q.id,
        title: q.title,
        description: q.description,
        cadence,
        xpReward: q.xpReward,
        difficulty: q.difficulty,
        expiresAt: q.expiresAt,
        aiSuggested: q.aiSuggested,
        skill: q.skill ? { id: q.skill.id, name: q.skill.name } : null,
        completedThisPeriod: dates.has(currentPeriod),
        currentPeriod,
        streak: streakFor(cadence, dates),
        completionsInWindow: q.completions.length,
        startDate: q.startDate,
        endDate: q.endDate,
        timesPerPeriod: q.timesPerPeriod,
      };
    });
  }),

  create: protectedProcedure
    .input(z.object(baseInput))
    .mutation(async ({ ctx, input }) => {
      if (input.skillId) await assertOwnsSkill(ctx, input.skillId);
      const [created] = await ctx.db
        .insert(quest)
        .values({
          userId: ctx.user.id,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          cadence: input.cadence,
          xpReward: input.xpReward,
          skillId: input.skillId ?? null,
          difficulty: input.difficulty ?? null,
          expiresAt: input.expiresAt ?? null,
          aiSuggested: input.aiSuggested ?? false,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          timesPerPeriod: input.timesPerPeriod ?? null,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullish(),
        cadence: cadenceSchema.optional(),
        xpReward: z.number().int().min(0).max(1000).optional(),
        skillId: z.string().uuid().nullish(),
        difficulty: difficultySchema.nullish(),
        // Side-quest deadline. Accepts a YYYY-MM-DD string (coerced to a
        // Date) or null to clear. z.coerce.date() turns "" into Invalid Date,
        // so we normalise empty → null before coercion via preprocess.
        expiresAt: z.preprocess(
          (v) => (v === "" || v === undefined ? undefined : v),
          z.coerce.date().nullish(),
        ),
        startDate: z.preprocess(
          (v) => (v === "" ? null : v),
          isoDateStr.nullish(),
        ),
        endDate: z.preprocess(
          (v) => (v === "" ? null : v),
          isoDateStr.nullish(),
        ),
        timesPerPeriod: z.preprocess(
          (v) => (v === "" || v === undefined ? undefined : v),
          z.coerce.number().int().min(1).max(100).nullish(),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsQuest(ctx, input.id);
      if (input.skillId) await assertOwnsSkill(ctx, input.skillId);
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(quest)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(quest.id, id))
        .returning();
      return updated;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsQuest(ctx, input.id);
      await ctx.db
        .update(quest)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(quest.id, input.id));
      return { success: true };
    }),

  // Toggle completion for the current period (today for daily, this week for weekly).
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const q = await ctx.db.query.quest.findFirst({
        where: and(eq(quest.id, input.id), eq(quest.userId, ctx.user.id)),
      });
      if (!q) throw new TRPCError({ code: "NOT_FOUND" });

      const period = periodFor(q.cadence as Cadence);
      const existing = await ctx.db.query.questCompletion.findFirst({
        where: and(
          eq(questCompletion.questId, q.id),
          eq(questCompletion.completedFor, period),
        ),
      });

      if (existing) {
        await ctx.db
          .delete(questCompletion)
          .where(eq(questCompletion.id, existing.id));
        return { completed: false };
      }
      await ctx.db.insert(questCompletion).values({
        questId: q.id,
        completedFor: period,
      });
      return { completed: true };
    }),
});

async function assertOwnsQuest(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  questId: string,
) {
  const q = await ctx.db.query.quest.findFirst({
    where: and(eq(quest.id, questId), eq(quest.userId, ctx.user.id)),
    columns: { id: true },
  });
  if (!q) throw new TRPCError({ code: "NOT_FOUND" });
}

async function assertOwnsSkill(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  skillId: string,
) {
  const s = await ctx.db.query.skill.findFirst({
    where: and(eq(skill.id, skillId), eq(skill.userId, ctx.user.id)),
    columns: { id: true },
  });
  if (!s) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Skill not found",
    });
  }
}
