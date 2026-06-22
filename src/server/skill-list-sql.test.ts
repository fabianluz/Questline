import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import { XP_PER_MILESTONE, levelProgress } from "@/lib/xp";

const {
  user, skill, epic, milestone, milestoneSkill, quest, questCompletion, focusSession,
} = schema;

// Regression guard: skill.list aggregates XP across milestones/quests/focus.
// A bare `SUM(<JS constant>)` binds the constant as a param → `SUM(unknown)`,
// which Postgres rejects ("function sum(unknown) is not unique") once there are
// rows to aggregate. Auth-gated route probes never run this SQL, so we exercise
// it directly against a real PGlite DB seeded with imported-style data.
describe("skill.list against a real PGlite DB", () => {
  it("runs every aggregate without throwing on populated data", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });

    const uid = "u1";
    await db.insert(user).values({ id: uid, name: "T", email: "t@t.io" });
    const [s1] = await db.insert(skill).values({ userId: uid, name: "Java: Core", domain: "Programming" }).returning();
    const [s2] = await db.insert(skill).values({ userId: uid, name: "Dutch: Reading", domain: "Dutch" }).returning();
    const [e1] = await db.insert(epic).values({ userId: uid, title: "E" }).returning();
    const [m1] = await db.insert(milestone).values({ epicId: e1.id, title: "M", status: "completed", completedAt: new Date() }).returning();
    await db.insert(milestoneSkill).values({ milestoneId: m1.id, skillId: s1.id });
    const [q1] = await db.insert(quest).values({ userId: uid, title: "Q", cadence: "daily", xpReward: 15, skillId: s1.id }).returning();
    await db.insert(questCompletion).values({ questId: q1.id, completedFor: new Date().toISOString().slice(0, 10) });
    await db.insert(focusSession).values({ userId: uid, label: "Focus", skillId: s2.id, durationMin: 30, xpAwarded: 20, endedAt: new Date() });

    // --- exact skill.list query sequence ---
    const run = async () => {
      const milestoneRows = await db
        .select({
          id: skill.id, name: skill.name, description: skill.description,
          targetDate: skill.targetDate, domain: skill.domain, createdAt: skill.createdAt,
          milestoneXp: sql<number>`COALESCE(SUM(CASE WHEN ${milestone.status} = 'completed' THEN ${XP_PER_MILESTONE} ELSE 0 END), 0)::int`,
          milestoneCount: sql<number>`COUNT(DISTINCT ${milestoneSkill.milestoneId})::int`,
        })
        .from(skill)
        .leftJoin(milestoneSkill, eq(milestoneSkill.skillId, skill.id))
        .leftJoin(milestone, eq(milestoneSkill.milestoneId, milestone.id))
        .where(eq(skill.userId, uid))
        .groupBy(skill.id, skill.name, skill.description, skill.targetDate, skill.domain, skill.createdAt)
        .orderBy(asc(skill.name));

      const questRows = await db
        .select({
          skillId: quest.skillId,
          questXp: sql<number>`COALESCE(SUM(${quest.xpReward}), 0)::int`,
          completionCount: sql<number>`COUNT(${questCompletion.id})::int`,
        })
        .from(quest)
        .innerJoin(questCompletion, eq(questCompletion.questId, quest.id))
        .where(and(eq(quest.userId, uid), isNotNull(quest.skillId)))
        .groupBy(quest.skillId);

      const focusRows = await db
        .select({
          skillId: focusSession.skillId,
          focusXp: sql<number>`COALESCE(SUM(${focusSession.xpAwarded}), 0)::int`,
          focusMinutes: sql<number>`COALESCE(SUM(${focusSession.durationMin}), 0)::int`,
        })
        .from(focusSession)
        .where(and(eq(focusSession.userId, uid), isNotNull(focusSession.skillId)))
        .groupBy(focusSession.skillId);

      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const weekAgoISO = weekAgo.toISOString().slice(0, 10);
      const wkMilestone = await db
        .select({ skillId: milestoneSkill.skillId, xp: sql<number>`(COUNT(*) * ${sql.raw(String(XP_PER_MILESTONE))})::int` })
        .from(milestoneSkill)
        .innerJoin(milestone, eq(milestoneSkill.milestoneId, milestone.id))
        .innerJoin(skill, eq(milestoneSkill.skillId, skill.id))
        .where(and(eq(skill.userId, uid), eq(milestone.status, "completed"), isNotNull(milestone.completedAt), gte(milestone.completedAt, weekAgo)))
        .groupBy(milestoneSkill.skillId);
      const wkQuest = await db
        .select({ skillId: quest.skillId, xp: sql<number>`COALESCE(SUM(${quest.xpReward}), 0)::int` })
        .from(quest)
        .innerJoin(questCompletion, eq(questCompletion.questId, quest.id))
        .where(and(eq(quest.userId, uid), isNotNull(quest.skillId), gte(questCompletion.completedFor, weekAgoISO)))
        .groupBy(quest.skillId);
      const wkFocus = await db
        .select({ skillId: focusSession.skillId, xp: sql<number>`COALESCE(SUM(${focusSession.xpAwarded}), 0)::int` })
        .from(focusSession)
        .where(and(eq(focusSession.userId, uid), isNotNull(focusSession.skillId), isNotNull(focusSession.endedAt), gte(focusSession.endedAt, weekAgo)))
        .groupBy(focusSession.skillId);

      const questXpBySkill = new Map(questRows.map((r) => [r.skillId, { xp: r.questXp, count: r.completionCount }]));
      const focusBySkill = new Map(focusRows.map((r) => [r.skillId, { xp: r.focusXp, minutes: r.focusMinutes }]));
      const weeklyBySkill = new Map<string, number>();
      for (const r of [...wkMilestone, ...wkQuest, ...wkFocus]) {
        if (!r.skillId) continue;
        weeklyBySkill.set(r.skillId, (weeklyBySkill.get(r.skillId) ?? 0) + r.xp);
      }
      return milestoneRows.map((r) => {
        const fromQuests = questXpBySkill.get(r.id) ?? { xp: 0, count: 0 };
        const fromFocus = focusBySkill.get(r.id) ?? { xp: 0, minutes: 0 };
        return { ...levelProgress(r.milestoneXp + fromQuests.xp + fromFocus.xp), id: r.id, name: r.name };
      });
    };

    const result = await run();
    expect(result.length).toBe(2);
    expect(result.find((r) => r.name === "Java: Core")).toBeTruthy();
  });
});
