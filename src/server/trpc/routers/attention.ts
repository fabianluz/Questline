import { and, eq, gte, inArray, isNotNull, lt, notInArray } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { epic, milestone, quest, questCompletion } from "@/server/db/schema";
import { periodFor, startOfWeekUTC, type Cadence } from "@/lib/quest-periods";

/**
 * Tiny, cheap counters that drive the nav "attention" badge: how many
 * milestones are overdue and how many recurring quests are still pending for
 * their current period. Kept deliberately small so it can run on every page.
 */
export const attentionRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10);

    const overdueRows = await ctx.db
      .select({ id: milestone.id })
      .from(milestone)
      .innerJoin(epic, eq(milestone.epicId, epic.id))
      .where(
        and(
          eq(epic.userId, ctx.user.id),
          notInArray(milestone.status, ["completed", "abandoned"]),
          isNotNull(milestone.estimatedAchievementDate),
          lt(milestone.estimatedAchievementDate, today),
        ),
      );

    const weekStart = startOfWeekUTC();
    const quests = await ctx.db.query.quest.findMany({
      where: and(
        eq(quest.userId, ctx.user.id),
        eq(quest.archived, false),
        inArray(quest.cadence, ["daily", "weekly"]),
      ),
      columns: { id: true, cadence: true },
      with: {
        completions: {
          where: gte(questCompletion.completedFor, weekStart),
          columns: { completedFor: true },
        },
      },
    });

    let questsPending = 0;
    for (const q of quests) {
      const period = periodFor(q.cadence as Cadence);
      if (!q.completions.some((c) => c.completedFor === period)) questsPending++;
    }

    const overdueMilestones = overdueRows.length;
    return {
      overdueMilestones,
      questsPending,
      total: overdueMilestones + questsPending,
    };
  }),
});
