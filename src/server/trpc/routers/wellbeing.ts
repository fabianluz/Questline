import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import {
  weeklyRetrospective,
  userPreference,
  quest,
  questCompletion,
  milestone,
  epic,
  skill,
} from "@/server/db/schema";
import { generateTrophySvg } from "@/lib/trophy";
import { startOfWeekUTC } from "@/lib/quest-periods";

/**
 * Wellbeing router — Trophy Room (§6) + Save Point retrospective (§10) +
 * the single-row user preference object. Status Effects (Debuffs), Fatigue
 * meter, and Boss Battle mode were removed for simplicity.
 */

const prefsPatch = z.object({
  workWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  workWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  workWindowDays: z.string().regex(/^[01]{7}$/).optional(),
  defaultStepDurationMin: z.number().int().min(10).max(480).optional(),
  onboardingStep: z
    .enum(["avatar", "first_quest", "first_epic", "done"])
    .optional(),
});

const retroInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wentWell: z.string().max(2000).optional(),
  struggled: z.string().max(2000).optional(),
  nextWeekFocus: z.string().max(2000).optional(),
});

export const wellbeingRouter = router({
  // -----  Preferences  -----

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.query.userPreference.findFirst({
      where: eq(userPreference.userId, ctx.user.id),
    });
    if (existing) return existing;
    const [created] = await ctx.db
      .insert(userPreference)
      .values({ userId: ctx.user.id })
      .returning();
    return created;
  }),

  updatePreferences: protectedProcedure
    .input(prefsPatch)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id })
        .onConflictDoNothing();
      const [updated] = await ctx.db
        .update(userPreference)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(userPreference.userId, ctx.user.id))
        .returning();
      return updated;
    }),

  // -----  Trophy Room (§6)  -----

  listTrophies: protectedProcedure.query(async ({ ctx }) => {
    const completed = await ctx.db.query.epic.findMany({
      where: and(eq(epic.userId, ctx.user.id), eq(epic.status, "completed")),
      with: {
        category: { columns: { name: true, color: true } },
        milestones: { columns: { id: true, title: true, completedAt: true } },
      },
      orderBy: [desc(epic.completedAt)],
    });
    return completed.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      completedAt: e.completedAt,
      category: e.category,
      milestoneCount: e.milestones.length,
      sigilSvg: generateTrophySvg(e.id, e.title, 200),
    }));
  }),

  // -----  Save Points (§10)  -----

  getCurrentSavePoint: protectedProcedure.query(async ({ ctx }) => {
    const weekStart = startOfWeekUTC();
    const existing = await ctx.db.query.weeklyRetrospective.findFirst({
      where: and(
        eq(weeklyRetrospective.userId, ctx.user.id),
        eq(weeklyRetrospective.weekStart, weekStart),
      ),
    });
    const sevenAgo = new Date();
    sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 7);
    const sevenAgoISO = sevenAgo.toISOString().slice(0, 10);

    const completions = await ctx.db
      .select({
        questId: questCompletion.questId,
        xp: quest.xpReward,
        skillId: quest.skillId,
      })
      .from(questCompletion)
      .innerJoin(quest, eq(quest.id, questCompletion.questId))
      .where(
        and(
          eq(quest.userId, ctx.user.id),
          gte(questCompletion.completedFor, sevenAgoISO),
        ),
      );

    const milestonesCompleted = await ctx.db
      .select({ id: milestone.id })
      .from(milestone)
      .innerJoin(epic, eq(milestone.epicId, epic.id))
      .where(
        and(
          eq(epic.userId, ctx.user.id),
          eq(milestone.status, "completed"),
          gte(milestone.completedAt, sevenAgo),
        ),
      );

    const xpBySkill = new Map<string, number>();
    for (const c of completions) {
      if (!c.skillId) continue;
      xpBySkill.set(c.skillId, (xpBySkill.get(c.skillId) ?? 0) + c.xp);
    }
    let topSkill: { name: string; xpGained: number } | null = null;
    if (xpBySkill.size > 0) {
      const [topId, topXp] = [...xpBySkill.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      const s = await ctx.db.query.skill.findFirst({
        where: eq(skill.id, topId),
        columns: { name: true },
      });
      if (s) topSkill = { name: s.name, xpGained: topXp };
    }

    const xpGained = completions.reduce((sum, c) => sum + c.xp, 0);

    return {
      weekStart,
      existing: existing ?? null,
      stats: {
        questsCompleted: completions.length,
        milestonesCompleted: milestonesCompleted.length,
        xpGained,
        topSkill,
      },
    };
  }),

  saveSavePoint: protectedProcedure
    .input(retroInput)
    .mutation(async ({ ctx, input }) => {
      // Stats are computed live by `getCurrentSavePoint` whenever the user
      // opens the card — no need to snapshot them at save time. Retros are
      // just three text fields keyed by week.
      const [row] = await ctx.db
        .insert(weeklyRetrospective)
        .values({
          userId: ctx.user.id,
          weekStart: input.weekStart,
          wentWell: input.wentWell?.trim() || null,
          struggled: input.struggled?.trim() || null,
          nextWeekFocus: input.nextWeekFocus?.trim() || null,
        })
        .onConflictDoUpdate({
          target: [weeklyRetrospective.userId, weeklyRetrospective.weekStart],
          set: {
            wentWell: input.wentWell?.trim() || null,
            struggled: input.struggled?.trim() || null,
            nextWeekFocus: input.nextWeekFocus?.trim() || null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    }),
});
