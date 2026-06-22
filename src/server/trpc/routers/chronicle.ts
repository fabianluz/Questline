import { and, eq, gte, isNotNull } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import {
  epic,
  focusSession,
  milestone,
  quest,
  questCompletion,
  skill,
} from "@/server/db/schema";
import { XP_PER_MILESTONE } from "@/lib/xp";
import { streakFor } from "@/lib/quest-periods";

const HEATMAP_DAYS = 126; // 18 weeks

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Chronicle — read-only aggregates over the data the app already accumulates:
 * quest completion heatmap, streaks, milestones-per-month, time-by-domain from
 * Focus Sessions, and total XP earned.
 */
export const chronicleRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const cutoff = isoDaysAgo(HEATMAP_DAYS - 1);

    // --- Quest completions (windowed, for heatmap + daily streak) ---
    const windowComps = await ctx.db
      .select({
        completedFor: questCompletion.completedFor,
        cadence: quest.cadence,
      })
      .from(questCompletion)
      .innerJoin(quest, eq(quest.id, questCompletion.questId))
      .where(
        and(eq(quest.userId, userId), gte(questCompletion.completedFor, cutoff)),
      );

    const heatCounts = new Map<string, number>();
    const dailyDates = new Set<string>();
    for (const c of windowComps) {
      heatCounts.set(c.completedFor, (heatCounts.get(c.completedFor) ?? 0) + 1);
      if (c.cadence === "daily") dailyDates.add(c.completedFor);
    }
    const heatmap: { date: string; count: number }[] = [];
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const date = isoDaysAgo(i);
      heatmap.push({ date, count: heatCounts.get(date) ?? 0 });
    }
    const currentStreak = streakFor("daily", dailyDates);
    // Best streak across the window.
    let bestStreak = 0;
    let run = 0;
    for (const { date } of heatmap) {
      if (dailyDates.has(date)) {
        run += 1;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = 0;
      }
    }

    // --- All-time quest completion count + XP ---
    const allComps = await ctx.db
      .select({ xp: quest.xpReward })
      .from(questCompletion)
      .innerJoin(quest, eq(quest.id, questCompletion.questId))
      .where(eq(quest.userId, userId));
    const questCompletions = allComps.length;
    const questXp = allComps.reduce((s, r) => s + (r.xp ?? 0), 0);

    // --- Completed milestones (by month, last 12) ---
    const completed = await ctx.db
      .select({ completedAt: milestone.completedAt })
      .from(milestone)
      .innerJoin(epic, eq(milestone.epicId, epic.id))
      .where(
        and(
          eq(epic.userId, userId),
          eq(milestone.status, "completed"),
          isNotNull(milestone.completedAt),
        ),
      );
    const monthCounts = new Map<string, number>();
    for (const m of completed) {
      if (!m.completedAt) continue;
      const key = m.completedAt.toISOString().slice(0, 7); // YYYY-MM
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    }
    const milestonesByMonth: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - i);
      const key = d.toISOString().slice(0, 7);
      milestonesByMonth.push({ month: key, count: monthCounts.get(key) ?? 0 });
    }
    const completedMilestones = completed.length;

    // --- Focus sessions: totals + by domain + by day (windowed) ---
    const sessions = await ctx.db
      .select({
        startedAt: focusSession.startedAt,
        durationMin: focusSession.durationMin,
        xpAwarded: focusSession.xpAwarded,
        skillId: focusSession.skillId,
      })
      .from(focusSession)
      .where(and(eq(focusSession.userId, userId), isNotNull(focusSession.endedAt)));
    const skills = await ctx.db
      .select({ id: skill.id, domain: skill.domain })
      .from(skill)
      .where(eq(skill.userId, userId));
    const domainBySkill = new Map(skills.map((s) => [s.id, s.domain ?? "Other"]));

    let focusMinutes = 0;
    let focusXp = 0;
    const byDomain = new Map<string, number>();
    for (const s of sessions) {
      focusMinutes += s.durationMin;
      focusXp += s.xpAwarded;
      const dom = s.skillId ? (domainBySkill.get(s.skillId) ?? "Other") : "Unassigned";
      byDomain.set(dom, (byDomain.get(dom) ?? 0) + s.durationMin);
    }
    const focusByDomain = [...byDomain.entries()]
      .map(([domain, minutes]) => ({ domain, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    const xpEarned = completedMilestones * XP_PER_MILESTONE + questXp + focusXp;

    // Momentum: completions in the last 7 days (heatmap tail).
    const last7 = heatmap.slice(-7).reduce((s, h) => s + h.count, 0);

    return {
      heatmap,
      currentStreak,
      bestStreak,
      questCompletions,
      completedMilestones,
      milestonesByMonth,
      focusMinutes,
      focusByDomain,
      xpEarned,
      momentum: last7,
    };
  }),
});
