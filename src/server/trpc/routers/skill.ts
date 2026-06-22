import { z } from "zod";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  focusSession,
  milestone,
  milestoneSkill,
  quest,
  questCompletion,
  skill,
  skillPrerequisite,
} from "@/server/db/schema";
import { XP_PER_MILESTONE, levelProgress } from "@/lib/xp";
import { planSkillLinks } from "@/lib/skill-graph";
import { suggestSkillLinks, suggestSkillsForMilestones } from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

export const skillRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // 1. Skills + XP from completed milestones (existing behavior).
    const milestoneRows = await ctx.db
      .select({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        targetDate: skill.targetDate,
        domain: skill.domain,
        createdAt: skill.createdAt,
        milestoneXp: sql<number>`COALESCE(SUM(CASE WHEN ${milestone.status} = 'completed' THEN ${XP_PER_MILESTONE} ELSE 0 END), 0)::int`,
        milestoneCount: sql<number>`COUNT(DISTINCT ${milestoneSkill.milestoneId})::int`,
      })
      .from(skill)
      .leftJoin(milestoneSkill, eq(milestoneSkill.skillId, skill.id))
      .leftJoin(milestone, eq(milestoneSkill.milestoneId, milestone.id))
      .where(eq(skill.userId, ctx.user.id))
      .groupBy(skill.id, skill.name, skill.description, skill.targetDate, skill.domain, skill.createdAt)
      .orderBy(asc(skill.name));

    // 2. XP from quest completions, separately (to avoid Cartesian join blowup).
    //    Each completion grants the quest's xpReward to its linked skill.
    const questRows = await ctx.db
      .select({
        skillId: quest.skillId,
        questXp: sql<number>`COALESCE(SUM(${quest.xpReward}), 0)::int`,
        completionCount: sql<number>`COUNT(${questCompletion.id})::int`,
      })
      .from(quest)
      .innerJoin(questCompletion, eq(questCompletion.questId, quest.id))
      .where(and(eq(quest.userId, ctx.user.id), isNotNull(quest.skillId)))
      .groupBy(quest.skillId);

    const questXpBySkill = new Map(
      questRows.map((r) => [r.skillId, { xp: r.questXp, count: r.completionCount }]),
    );

    // 3. XP from completed Focus Sessions credited to a skill.
    const focusRows = await ctx.db
      .select({
        skillId: focusSession.skillId,
        focusXp: sql<number>`COALESCE(SUM(${focusSession.xpAwarded}), 0)::int`,
        focusMinutes: sql<number>`COALESCE(SUM(${focusSession.durationMin}), 0)::int`,
      })
      .from(focusSession)
      .where(
        and(eq(focusSession.userId, ctx.user.id), isNotNull(focusSession.skillId)),
      )
      .groupBy(focusSession.skillId);
    const focusBySkill = new Map(
      focusRows.map((r) => [r.skillId, { xp: r.focusXp, minutes: r.focusMinutes }]),
    );

    // 4. XP earned in the last 7 days, per skill — the "momentum" delta. Summed
    //    across all three sources (milestones completed, quest completions,
    //    focus sessions) within the window.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const weekAgoISO = weekAgo.toISOString().slice(0, 10);

    const wkMilestone = await ctx.db
      .select({
        skillId: milestoneSkill.skillId,
        // Each grouped row = one completed-this-week milestone for this skill,
        // worth XP_PER_MILESTONE. Inline the constant as a literal — `SUM(<bind
        // param>)` resolves to `SUM(unknown)` which Postgres rejects.
        xp: sql<number>`(COUNT(*) * ${sql.raw(String(XP_PER_MILESTONE))})::int`,
      })
      .from(milestoneSkill)
      .innerJoin(milestone, eq(milestoneSkill.milestoneId, milestone.id))
      .innerJoin(skill, eq(milestoneSkill.skillId, skill.id))
      .where(
        and(
          eq(skill.userId, ctx.user.id),
          eq(milestone.status, "completed"),
          isNotNull(milestone.completedAt),
          gte(milestone.completedAt, weekAgo),
        ),
      )
      .groupBy(milestoneSkill.skillId);

    const wkQuest = await ctx.db
      .select({
        skillId: quest.skillId,
        xp: sql<number>`COALESCE(SUM(${quest.xpReward}), 0)::int`,
      })
      .from(quest)
      .innerJoin(questCompletion, eq(questCompletion.questId, quest.id))
      .where(
        and(
          eq(quest.userId, ctx.user.id),
          isNotNull(quest.skillId),
          gte(questCompletion.completedFor, weekAgoISO),
        ),
      )
      .groupBy(quest.skillId);

    const wkFocus = await ctx.db
      .select({
        skillId: focusSession.skillId,
        xp: sql<number>`COALESCE(SUM(${focusSession.xpAwarded}), 0)::int`,
      })
      .from(focusSession)
      .where(
        and(
          eq(focusSession.userId, ctx.user.id),
          isNotNull(focusSession.skillId),
          isNotNull(focusSession.endedAt),
          gte(focusSession.endedAt, weekAgo),
        ),
      )
      .groupBy(focusSession.skillId);

    const weeklyBySkill = new Map<string, number>();
    for (const r of [...wkMilestone, ...wkQuest, ...wkFocus]) {
      if (!r.skillId) continue;
      weeklyBySkill.set(r.skillId, (weeklyBySkill.get(r.skillId) ?? 0) + r.xp);
    }

    return milestoneRows.map((r) => {
      const fromQuests = questXpBySkill.get(r.id) ?? { xp: 0, count: 0 };
      const fromFocus = focusBySkill.get(r.id) ?? { xp: 0, minutes: 0 };
      const totalXp = r.milestoneXp + fromQuests.xp + fromFocus.xp;
      // `levelProgress` already returns `totalXp` — spread it FIRST so our
      // explicit fields below override (and TS doesn't flag a duplicate key).
      return {
        ...levelProgress(totalXp),
        id: r.id,
        name: r.name,
        description: r.description,
        targetDate: r.targetDate,
        domain: r.domain,
        createdAt: r.createdAt,
        milestoneXp: r.milestoneXp,
        questXp: fromQuests.xp,
        focusXp: fromFocus.xp,
        focusMinutes: fromFocus.minutes,
        milestoneCount: r.milestoneCount,
        questCompletionCount: fromQuests.count,
        weeklyXp: weeklyBySkill.get(r.id) ?? 0,
      };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [created] = await ctx.db
          .insert(skill)
          .values({
            userId: ctx.user.id,
            name: input.name.trim(),
            description: input.description,
          })
          .returning();
        return created;
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("skill_user_name_idx")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A skill named "${input.name}" already exists.`,
          });
        }
        throw err;
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().max(500).nullish(),
        // "acquire by" deadline — nullish so it can be set AND cleared.
        targetDate: z.string().nullish(),
        // Domain grouping (colours the constellation). nullish to clear.
        domain: z.string().max(40).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      if (updates.targetDate === "") updates.targetDate = null;
      if (updates.domain === "") updates.domain = null;
      else if (typeof updates.domain === "string")
        updates.domain = updates.domain.trim();
      if (typeof updates.name === "string") updates.name = updates.name.trim();
      try {
        const [updated] = await ctx.db
          .update(skill)
          .set(updates)
          .where(and(eq(skill.id, id), eq(skill.userId, ctx.user.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("skill_user_name_idx")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A skill named "${input.name}" already exists.`,
          });
        }
        throw err;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(skill)
        .where(and(eq(skill.id, input.id), eq(skill.userId, ctx.user.id)));
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────
  // Skill Constellation — progression edges between skills.

  /** All prerequisite edges for the current user (drives the constellation). */
  prerequisites: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.skillPrerequisite.findMany({
      where: eq(skillPrerequisite.userId, ctx.user.id),
      columns: { id: true, skillId: true, requiredSkillId: true },
    });
    return rows;
  }),

  /**
   * Link `requiredSkillId` as a prerequisite of `skillId` ("to build skill,
   * first build requiredSkill"). Rejects self-edges, duplicates, cross-user
   * refs, and any edge that would introduce a cycle.
   */
  addPrerequisite: protectedProcedure
    .input(
      z.object({
        skillId: z.string().uuid(),
        requiredSkillId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.skillId === input.requiredSkillId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A skill can't require itself.",
        });
      }
      // Both skills must belong to the user.
      const owned = await ctx.db.query.skill.findMany({
        where: and(
          eq(skill.userId, ctx.user.id),
          inArray(skill.id, [input.skillId, input.requiredSkillId]),
        ),
        columns: { id: true },
      });
      if (owned.length !== 2) throw new TRPCError({ code: "NOT_FOUND" });

      // Cycle guard: adding (skill requires required) is illegal if `required`
      // can already reach `skill` along existing requires-edges.
      const edges = await ctx.db.query.skillPrerequisite.findMany({
        where: eq(skillPrerequisite.userId, ctx.user.id),
        columns: { skillId: true, requiredSkillId: true },
      });
      const adj = new Map<string, string[]>();
      for (const e of edges) {
        const arr = adj.get(e.skillId) ?? [];
        arr.push(e.requiredSkillId);
        adj.set(e.skillId, arr);
      }
      // DFS from requiredSkillId following requires-edges; if we hit skillId,
      // adding the edge would close a loop.
      const seen = new Set<string>();
      const stack = [input.requiredSkillId];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === input.skillId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That link would create a cycle in the skill tree.",
          });
        }
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const next of adj.get(cur) ?? []) stack.push(next);
      }

      try {
        const [created] = await ctx.db
          .insert(skillPrerequisite)
          .values({
            userId: ctx.user.id,
            skillId: input.skillId,
            requiredSkillId: input.requiredSkillId,
          })
          .returning();
        return created;
      } catch (err) {
        if (err instanceof Error && err.message.includes("skill_prereq_pair_idx")) {
          // Already linked — treat as a no-op success.
          return null;
        }
        throw err;
      }
    }),

  removePrerequisite: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(skillPrerequisite)
        .where(
          and(
            eq(skillPrerequisite.id, input.id),
            eq(skillPrerequisite.userId, ctx.user.id),
          ),
        );
      return { success: true };
    }),

  /** Ask the local LLM to propose progression links between skills. */
  aiSuggestLinks: protectedProcedure.mutation(({ ctx }) =>
    runForSurface(ctx.user.id, "skills", () => suggestSkillLinks(ctx.user.id)),
  ),

  /** Bulk-apply chosen links (cycle-safe, dedupes against existing). */
  applyLinks: protectedProcedure
    .input(
      z.object({
        links: z
          .array(
            z.object({
              skillId: z.string().uuid(),
              requiredSkillId: z.string().uuid(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const own = await ctx.db.query.skill.findMany({
        where: eq(skill.userId, ctx.user.id),
        columns: { id: true },
      });
      const existing = await ctx.db.query.skillPrerequisite.findMany({
        where: eq(skillPrerequisite.userId, ctx.user.id),
        columns: { skillId: true, requiredSkillId: true },
      });
      const safe = planSkillLinks(
        existing,
        input.links,
        new Set(own.map((s) => s.id)),
      );
      if (safe.length > 0) {
        await ctx.db
          .insert(skillPrerequisite)
          .values(safe.map((e) => ({ userId: ctx.user.id, ...e })))
          .onConflictDoNothing();
      }
      return { created: safe.length };
    }),

  // ─────────────────────────────────────────────────────────────────
  // Create Skills with AI — from an Epic's selected Milestones + Steps.

  /** Ask the local LLM to propose Skills for the chosen milestones. */
  aiSuggestForMilestones: protectedProcedure
    .input(z.object({ milestoneIds: z.array(z.string().uuid()).min(1).max(50) }))
    .mutation(({ ctx, input }) =>
      runForSurface(ctx.user.id, "skills", () =>
        suggestSkillsForMilestones(ctx.user.id, input.milestoneIds),
      ),
    ),

  /**
   * Create the accepted suggested skills and link each to its milestones.
   * Reuses an existing skill (by case-insensitive name) instead of creating a
   * duplicate. Only links milestones the user actually owns.
   */
  applySuggestedSkills: protectedProcedure
    .input(
      z.object({
        skills: z
          .array(
            z.object({
              name: z.string().min(1).max(50),
              description: z.string().max(500).nullish(),
              domain: z.string().max(40).nullish(),
              milestoneIds: z.array(z.string().uuid()).min(1),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Which referenced milestones actually belong to this user?
      const allMsIds = [
        ...new Set(input.skills.flatMap((s) => s.milestoneIds)),
      ];
      const ownedMs = await ctx.db.query.milestone.findMany({
        where: inArray(milestone.id, allMsIds),
        columns: { id: true },
        with: { epic: { columns: { userId: true } } },
      });
      const ownedSet = new Set(
        ownedMs.filter((m) => m.epic.userId === ctx.user.id).map((m) => m.id),
      );

      // Existing skills by lower-cased name → id (find-or-create).
      const existing = await ctx.db.query.skill.findMany({
        where: eq(skill.userId, ctx.user.id),
        columns: { id: true, name: true },
      });
      const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s.id]));

      let created = 0;
      let reused = 0;
      let linked = 0;
      for (const s of input.skills) {
        const key = s.name.trim().toLowerCase();
        let skillId = byName.get(key);
        if (!skillId) {
          const [row] = await ctx.db
            .insert(skill)
            .values({
              userId: ctx.user.id,
              name: s.name.trim(),
              description: s.description ?? null,
              domain: s.domain ?? null,
            })
            .returning();
          skillId = row.id;
          byName.set(key, skillId);
          created += 1;
        } else {
          reused += 1;
        }

        const rows = s.milestoneIds
          .filter((id) => ownedSet.has(id))
          .map((milestoneId) => ({ milestoneId, skillId: skillId! }));
        if (rows.length > 0) {
          const res = await ctx.db
            .insert(milestoneSkill)
            .values(rows)
            .onConflictDoNothing()
            .returning();
          linked += res.length;
        }
      }
      return { created, reused, linked };
    }),
});
