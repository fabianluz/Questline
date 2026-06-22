import { z } from "zod";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { DB } from "@/server/db";
import {
  calendarBlock,
  category,
  chapter,
  epic,
  externalCalendarSource,
  financialAccount,
  financialGoal,
  milestone,
  milestoneSkill,
  notificationLog,
  prerequisite,
  quest,
  recurringBill,
  resource,
  scheduleProfile,
  skill,
  skillPrerequisite,
  step,
  userPreference,
  weeklyRetrospective,
} from "@/server/db/schema";
import { planSkillLinks } from "@/lib/skill-graph";
import {
  AccountJson,
  BillJson,
  CategoryJson,
  EpicJson,
  GoalJson,
  MilestoneJson,
  PreferencesJson,
  ProfileJson,
  QuestJson,
  SkillJson,
} from "@/lib/json-shapes";

/**
 * JSON Import / Export router. Each entity supports:
 *   - export<Entity>(id?) → returns the JSON shape from json-shapes.ts
 *   - import<Entity>(json, ...) → validates against the matching schema
 *     and inserts; foreign-key references-by-name are resolved here.
 *
 * Plus the bulk:
 *   - exportProfile() → entire dataset
 *   - importProfile({json, mode})
 *       mode="merge"   → add only (default; never deletes existing data)
 *       mode="replace" → wipe user's data first, then insert
 *
 * Profile-level import is wrapped in a transaction so a mid-flight failure
 * doesn't leave the user with half a restore.
 */

const palette = ["#5b2a86", "#1f7a4f", "#b51d2a", "#e6a01a", "#2a6fbf", "#7f3fa6"];

// Helpers --------------------------------------------------------------------

async function resolveCategoryByName(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  name: string | null | undefined,
): Promise<string | null> {
  if (!name) return null;
  const existing = await ctx.db.query.category.findFirst({
    where: and(eq(category.userId, ctx.user.id), eq(category.name, name)),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [created] = await ctx.db
    .insert(category)
    .values({
      userId: ctx.user.id,
      name,
      color: palette[name.length % palette.length],
    })
    .returning({ id: category.id });
  return created.id;
}

async function resolveSkillByName(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  name: string | null | undefined,
): Promise<string | null> {
  if (!name) return null;
  const existing = await ctx.db.query.skill.findFirst({
    where: and(eq(skill.userId, ctx.user.id), eq(skill.name, name)),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [created] = await ctx.db
    .insert(skill)
    .values({ userId: ctx.user.id, name })
    .returning({ id: skill.id });
  return created.id;
}

async function resolveEpicByTitle(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  title: string | null | undefined,
): Promise<string | null> {
  if (!title) return null;
  const existing = await ctx.db.query.epic.findFirst({
    where: and(eq(epic.userId, ctx.user.id), eq(epic.title, title)),
    columns: { id: true },
  });
  return existing?.id ?? null;
}

async function insertMilestone(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  epicId: string,
  m: MilestoneJson,
) {
  const [created] = await ctx.db
    .insert(milestone)
    .values({
      epicId,
      key: m.key ?? null,
      title: m.title,
      description: m.description ?? null,
      status: m.status,
      tier: m.tier,
      position: m.position,
      estimatedStartDate: m.estimatedStartDate ?? null,
      estimatedAchievementDate: m.estimatedAchievementDate ?? null,
      estimatedHours: m.estimatedHours ?? null,
    })
    .returning({ id: milestone.id });

  for (const skillName of m.skills) {
    const skillId = await resolveSkillByName(ctx, skillName);
    if (skillId) {
      await ctx.db
        .insert(milestoneSkill)
        .values({ milestoneId: created.id, skillId })
        .onConflictDoNothing();
    }
  }
  if (m.steps.length > 0) {
    await ctx.db.insert(step).values(
      m.steps.map((s, i) => ({
        milestoneId: created.id,
        title: s.title,
        description: s.description ?? null,
        position: i,
        isCompleted: s.isCompleted,
        dueDate: s.dueDate ?? null,
        estimatedMinutes: s.estimatedMinutes ?? null,
      })),
    );
  }
  if (m.resources.length > 0) {
    await ctx.db.insert(resource).values(
      m.resources.map((r) => ({
        milestoneId: created.id,
        kind: r.kind,
        label: r.label,
        url: r.url ?? null,
        notes: r.notes ?? null,
        acquired: r.acquired,
      })),
    );
  }
  return created.id;
}

type IoCtx = { db: typeof import("@/server/db").db; user: { id: string } };
type SkillResolver = (ref: string | null | undefined) => string | null;

/** Upsert a milestone's children (steps/resources/skill links) in place:
 *  match by title/label, update definitional fields, ADD new ones, and never
 *  delete — and crucially preserve live progress (step.isCompleted,
 *  resource.acquired) that the user toggled in the app. */
async function upsertMilestoneChildren(
  ctx: IoCtx,
  milestoneId: string,
  m: MilestoneJson,
  resolveSkillId: SkillResolver,
  created: { steps: number; resources: number },
) {
  const existingSteps = await ctx.db.query.step.findMany({
    where: eq(step.milestoneId, milestoneId),
    columns: { id: true, title: true },
  });
  const stepByTitle = new Map(existingSteps.map((s) => [s.title.toLowerCase(), s.id]));
  for (let i = 0; i < m.steps.length; i++) {
    const s = m.steps[i];
    const id = stepByTitle.get(s.title.toLowerCase());
    if (id) {
      await ctx.db
        .update(step)
        .set({
          description: s.description ?? null,
          dueDate: s.dueDate ?? null,
          position: i,
          ...(s.estimatedMinutes !== undefined
            ? { estimatedMinutes: s.estimatedMinutes ?? null }
            : {}),
        })
        .where(eq(step.id, id));
    } else {
      await ctx.db.insert(step).values({
        milestoneId,
        title: s.title,
        description: s.description ?? null,
        position: i,
        isCompleted: s.isCompleted,
        dueDate: s.dueDate ?? null,
        estimatedMinutes: s.estimatedMinutes ?? null,
      });
      created.steps += 1;
    }
  }

  const existingRes = await ctx.db.query.resource.findMany({
    where: eq(resource.milestoneId, milestoneId),
    columns: { id: true, label: true },
  });
  const resByLabel = new Map(existingRes.map((r) => [r.label.toLowerCase(), r.id]));
  for (const r of m.resources) {
    const id = resByLabel.get(r.label.toLowerCase());
    if (id) {
      await ctx.db
        .update(resource)
        .set({ kind: r.kind, url: r.url ?? null, notes: r.notes ?? null })
        .where(eq(resource.id, id));
    } else {
      await ctx.db.insert(resource).values({
        milestoneId,
        kind: r.kind,
        label: r.label,
        url: r.url ?? null,
        notes: r.notes ?? null,
        acquired: r.acquired,
      });
      created.resources += 1;
    }
  }

  for (const ref of m.skills) {
    const skillId = resolveSkillId(ref);
    if (skillId) {
      await ctx.db
        .insert(milestoneSkill)
        .values({ milestoneId, skillId })
        .onConflictDoNothing();
    }
  }
}

/**
 * Resolve each milestone's `requires` (by key → title) into milestone→milestone
 * prerequisite rows. Runs AFTER all milestones exist so cross-epic refs resolve.
 * Skips self-edges, unresolved refs, and duplicates of existing edges. Shared by
 * merge + upsert imports.
 */
async function applyMilestoneRequires(ctx: IoCtx, userId: string, profile: ProfileJson) {
  const hasAny = profile.epics.some((e) =>
    e.milestones.some((m) => (m.requires?.length ?? 0) > 0),
  );
  if (!hasAny) return;

  const all = await ctx.db.query.milestone.findMany({
    with: { epic: { columns: { userId: true } } },
    columns: { id: true, key: true, title: true },
  });
  const mine = all.filter((m) => m.epic.userId === userId);
  const byKey = new Map(mine.flatMap((m) => (m.key ? [[m.key, m.id] as const] : [])));
  const byTitle = new Map(mine.map((m) => [m.title.toLowerCase(), m.id] as const));
  const resolve = (ref: string) => byKey.get(ref) ?? byTitle.get(ref.toLowerCase());

  const myIds = mine.map((m) => m.id);
  const existing = myIds.length
    ? await ctx.db.query.prerequisite.findMany({
        where: and(
          inArray(prerequisite.milestoneId, myIds),
          isNotNull(prerequisite.requiredMilestoneId),
        ),
        columns: { milestoneId: true, requiredMilestoneId: true },
      })
    : [];
  const seen = new Set(existing.map((p) => `${p.milestoneId}|${p.requiredMilestoneId}`));

  const rows: { milestoneId: string; requiredMilestoneId: string }[] = [];
  for (const e of profile.epics) {
    for (const m of e.milestones) {
      if (!m.requires?.length) continue;
      const mid = (m.key ? byKey.get(m.key) : undefined) ?? byTitle.get(m.title.toLowerCase());
      if (!mid) continue;
      for (const ref of m.requires) {
        const rid = resolve(ref);
        if (!rid || rid === mid) continue;
        const k = `${mid}|${rid}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ milestoneId: mid, requiredMilestoneId: rid });
      }
    }
  }
  if (rows.length > 0) await ctx.db.insert(prerequisite).values(rows);
}

/**
 * Idempotent import: match every entity by `key` → name/title, UPDATE it in
 * place, ADD anything new, and never delete. Lets the user treat their plan as
 * a living document — edit the JSON, re-import, no duplicates. Live progress
 * (XP, step/resource completion, financial balances) is preserved.
 */
async function upsertProfile(ctx: IoCtx, profile: ProfileJson) {
  const userId = ctx.user.id;
  const created = {
    categories: 0, skills: 0, epics: 0, milestones: 0, quests: 0,
    steps: 0, resources: 0, schedules: 0, calendarBlocks: 0,
    accounts: 0, bills: 0, goals: 0,
  };
  const updated = { categories: 0, skills: 0, epics: 0, milestones: 0, quests: 0 };

  // Categories (by name) — update color/icon.
  for (const c of profile.categories) {
    const existing = await ctx.db.query.category.findFirst({
      where: and(eq(category.userId, userId), eq(category.name, c.name)),
      columns: { id: true },
    });
    if (existing) {
      await ctx.db
        .update(category)
        .set({ color: c.color, icon: c.icon ?? null })
        .where(eq(category.id, existing.id));
      updated.categories += 1;
    } else {
      await ctx.db.insert(category).values({ userId, name: c.name, color: c.color, icon: c.icon ?? null });
      created.categories += 1;
    }
  }

  // Skills (by key → name).
  const existingSkills = await ctx.db.query.skill.findMany({
    where: eq(skill.userId, userId),
    columns: { id: true, key: true, name: true },
  });
  const skillByKey = new Map(existingSkills.flatMap((s) => (s.key ? [[s.key, s.id] as const] : [])));
  const skillByName = new Map(existingSkills.map((s) => [s.name.toLowerCase(), s.id] as const));
  const resolveSkillId: SkillResolver = (ref) =>
    ref ? skillByKey.get(ref) ?? skillByName.get(ref.toLowerCase()) ?? null : null;

  for (const s of profile.skills) {
    const id = (s.key ? skillByKey.get(s.key) : undefined) ?? skillByName.get(s.name.toLowerCase());
    if (id) {
      await ctx.db
        .update(skill)
        .set({
          name: s.name,
          description: s.description ?? null,
          targetDate: s.targetDate ?? null,
          domain: s.domain ?? null,
          ...(s.key ? { key: s.key } : {}),
        })
        .where(eq(skill.id, id));
      updated.skills += 1;
      skillByName.set(s.name.toLowerCase(), id);
      if (s.key) skillByKey.set(s.key, id);
    } else {
      const [row] = await ctx.db
        .insert(skill)
        .values({
          userId,
          key: s.key ?? null,
          name: s.name,
          description: s.description ?? null,
          targetDate: s.targetDate ?? null,
          domain: s.domain ?? null,
        })
        .returning({ id: skill.id });
      created.skills += 1;
      skillByName.set(s.name.toLowerCase(), row.id);
      if (s.key) skillByKey.set(s.key, row.id);
    }
  }

  // Skill constellation edges (cycle-safe; resolves requires by key → name).
  const edgeCandidates = profile.skills.flatMap((s) => {
    const skillId = resolveSkillId(s.key) ?? resolveSkillId(s.name);
    if (!skillId) return [];
    return (s.requires ?? []).flatMap((req) => {
      const requiredSkillId = resolveSkillId(req);
      return requiredSkillId && requiredSkillId !== skillId
        ? [{ skillId, requiredSkillId }]
        : [];
    });
  });
  if (edgeCandidates.length > 0) {
    const existingEdges = await ctx.db.query.skillPrerequisite.findMany({
      where: eq(skillPrerequisite.userId, userId),
      columns: { skillId: true, requiredSkillId: true },
    });
    const safe = planSkillLinks(existingEdges, edgeCandidates, new Set(skillByName.values()));
    if (safe.length > 0) {
      await ctx.db
        .insert(skillPrerequisite)
        .values(safe.map((e) => ({ userId, ...e })))
        .onConflictDoNothing();
    }
  }

  // Epics + milestones (by key → title).
  const existingEpics = await ctx.db.query.epic.findMany({
    where: eq(epic.userId, userId),
    columns: { id: true, key: true, title: true },
  });
  const epicByKey = new Map(existingEpics.flatMap((e) => (e.key ? [[e.key, e.id] as const] : [])));
  const epicByTitle = new Map(existingEpics.map((e) => [e.title.toLowerCase(), e.id] as const));
  const epicIds = existingEpics.map((e) => e.id);
  const allMilestones = epicIds.length
    ? await ctx.db.query.milestone.findMany({
        where: inArray(milestone.epicId, epicIds),
        columns: { id: true, key: true, title: true, epicId: true },
      })
    : [];
  const msByKey = new Map(allMilestones.flatMap((m) => (m.key ? [[m.key, m.id] as const] : [])));

  for (const e of profile.epics) {
    const categoryId = await resolveCategoryByName(ctx, e.category);
    let epicId = (e.key ? epicByKey.get(e.key) : undefined) ?? epicByTitle.get(e.title.toLowerCase());
    if (epicId) {
      await ctx.db
        .update(epic)
        .set({
          title: e.title,
          description: e.description ?? null,
          status: e.status,
          targetDate: e.targetDate ?? null,
          categoryId,
          ...(e.key ? { key: e.key } : {}),
          updatedAt: new Date(),
        })
        .where(eq(epic.id, epicId));
      updated.epics += 1;
    } else {
      const [row] = await ctx.db
        .insert(epic)
        .values({
          userId,
          key: e.key ?? null,
          title: e.title,
          description: e.description ?? null,
          status: e.status,
          targetDate: e.targetDate ?? null,
          categoryId,
        })
        .returning({ id: epic.id });
      epicId = row.id;
      created.epics += 1;
    }
    epicByTitle.set(e.title.toLowerCase(), epicId);
    if (e.key) epicByKey.set(e.key, epicId);

    const titleMap = new Map(
      allMilestones.filter((m) => m.epicId === epicId).map((m) => [m.title.toLowerCase(), m.id] as const),
    );
    for (const m of e.milestones) {
      const mId = (m.key ? msByKey.get(m.key) : undefined) ?? titleMap.get(m.title.toLowerCase());
      if (mId) {
        await ctx.db
          .update(milestone)
          .set({
            epicId,
            title: m.title,
            description: m.description ?? null,
            status: m.status,
            tier: m.tier,
            position: m.position,
            estimatedStartDate: m.estimatedStartDate ?? null,
            estimatedAchievementDate: m.estimatedAchievementDate ?? null,
            ...(m.estimatedHours !== undefined
              ? { estimatedHours: m.estimatedHours ?? null }
              : {}),
            ...(m.key ? { key: m.key } : {}),
            updatedAt: new Date(),
          })
          .where(eq(milestone.id, mId));
        updated.milestones += 1;
        await upsertMilestoneChildren(ctx, mId, m, resolveSkillId, created);
        titleMap.set(m.title.toLowerCase(), mId);
        if (m.key) msByKey.set(m.key, mId);
      } else {
        const newId = await insertMilestone(ctx, epicId, m);
        created.milestones += 1;
        created.steps += m.steps.length;
        created.resources += m.resources.length;
        titleMap.set(m.title.toLowerCase(), newId);
        if (m.key) msByKey.set(m.key, newId);
      }
    }
  }

  // Milestone → milestone prerequisites (after all milestones exist).
  await applyMilestoneRequires(ctx, userId, profile);

  // Quests (by key → title). Preserves completions (separate table).
  const existingQuests = await ctx.db.query.quest.findMany({
    where: eq(quest.userId, userId),
    columns: { id: true, key: true, title: true },
  });
  const questByKey = new Map(existingQuests.flatMap((q) => (q.key ? [[q.key, q.id] as const] : [])));
  const questByTitle = new Map(existingQuests.map((q) => [q.title.toLowerCase(), q.id] as const));
  for (const q of profile.quests) {
    const skillId = resolveSkillId(q.skill);
    const id = (q.key ? questByKey.get(q.key) : undefined) ?? questByTitle.get(q.title.toLowerCase());
    const vals = {
      title: q.title,
      description: q.description ?? null,
      cadence: q.cadence,
      xpReward: q.xpReward,
      skillId,
      difficulty: q.difficulty ?? null,
      expiresAt: q.expiresAt ? new Date(q.expiresAt) : null,
      startDate: q.startDate ?? null,
      endDate: q.endDate ?? null,
      timesPerPeriod: q.timesPerPeriod ?? null,
    };
    if (id) {
      await ctx.db
        .update(quest)
        .set({ ...vals, ...(q.key ? { key: q.key } : {}), updatedAt: new Date() })
        .where(eq(quest.id, id));
      updated.quests += 1;
    } else {
      await ctx.db.insert(quest).values({ userId, key: q.key ?? null, ...vals });
      created.quests += 1;
    }
  }

  // Schedule profiles (by key → name).
  const existingSchedules = await ctx.db.query.scheduleProfile.findMany({
    where: eq(scheduleProfile.userId, userId),
    columns: { id: true, key: true, name: true },
  });
  const schedByKey = new Map(existingSchedules.flatMap((s) => (s.key ? [[s.key, s.id] as const] : [])));
  const schedByName = new Map(existingSchedules.map((s) => [s.name.toLowerCase(), s.id] as const));
  for (const s of profile.schedules) {
    const vals = {
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      breakStart: s.breakStart ?? null,
      breakEnd: s.breakEnd ?? null,
      days: s.days,
      effectiveFrom: s.effectiveFrom ?? null,
      effectiveTo: s.effectiveTo ?? null,
      color: s.color ?? null,
      priority: s.priority,
      active: s.active,
      notes: s.notes ?? null,
    };
    const id = (s.key ? schedByKey.get(s.key) : undefined) ?? schedByName.get(s.name.toLowerCase());
    if (id) {
      await ctx.db
        .update(scheduleProfile)
        .set({ ...vals, ...(s.key ? { key: s.key } : {}), updatedAt: new Date() })
        .where(eq(scheduleProfile.id, id));
    } else {
      await ctx.db.insert(scheduleProfile).values({ userId, key: s.key ?? null, ...vals });
      created.schedules += 1;
    }
  }

  // Calendar blocks (by key → title).
  const existingBlocks = await ctx.db.query.calendarBlock.findMany({
    where: eq(calendarBlock.userId, userId),
    columns: { id: true, key: true, title: true },
  });
  const blockByKey = new Map(existingBlocks.flatMap((b) => (b.key ? [[b.key, b.id] as const] : [])));
  const blockByTitle = new Map(existingBlocks.map((b) => [b.title.toLowerCase(), b.id] as const));
  for (const b of profile.calendarBlocks) {
    const vals = {
      title: b.title,
      kind: b.kind,
      startDate: b.startDate,
      endDate: b.endDate,
      allDay: b.allDay,
      startTime: b.startTime ?? null,
      endTime: b.endTime ?? null,
      blocksWork: b.blocksWork,
      color: b.color ?? null,
      notes: b.notes ?? null,
    };
    const id = (b.key ? blockByKey.get(b.key) : undefined) ?? blockByTitle.get(b.title.toLowerCase());
    if (id) {
      await ctx.db
        .update(calendarBlock)
        .set({ ...vals, ...(b.key ? { key: b.key } : {}), updatedAt: new Date() })
        .where(eq(calendarBlock.id, id));
    } else {
      await ctx.db.insert(calendarBlock).values({ userId, key: b.key ?? null, ...vals });
      created.calendarBlocks += 1;
    }
  }

  // Finances (by name) — update definitional fields, PRESERVE live balances
  // (account.balanceCents, goal.currentCents/status).
  for (const a of profile.accounts) {
    const existing = await ctx.db.query.financialAccount.findFirst({
      where: and(eq(financialAccount.userId, userId), eq(financialAccount.name, a.name)),
      columns: { id: true },
    });
    if (existing) {
      await ctx.db
        .update(financialAccount)
        .set({ kind: a.kind, category: a.category, currency: a.currency, notes: a.notes ?? null })
        .where(eq(financialAccount.id, existing.id));
    } else {
      await ctx.db.insert(financialAccount).values({ userId, ...a });
      created.accounts += 1;
    }
  }
  for (const b of profile.bills) {
    const existing = await ctx.db.query.recurringBill.findFirst({
      where: and(eq(recurringBill.userId, userId), eq(recurringBill.name, b.name)),
      columns: { id: true },
    });
    if (existing) {
      await ctx.db
        .update(recurringBill)
        .set({
          amountCents: b.amountCents,
          currency: b.currency,
          cadence: b.cadence,
          category: b.category,
          nextDueDate: b.nextDueDate ?? null,
        })
        .where(eq(recurringBill.id, existing.id));
    } else {
      await ctx.db.insert(recurringBill).values({
        userId,
        name: b.name,
        amountCents: b.amountCents,
        currency: b.currency,
        cadence: b.cadence,
        category: b.category,
        nextDueDate: b.nextDueDate ?? null,
      });
      created.bills += 1;
    }
  }
  for (const g of profile.goals) {
    const epicId = await resolveEpicByTitle(ctx, g.epic);
    const existing = await ctx.db.query.financialGoal.findFirst({
      where: and(eq(financialGoal.userId, userId), eq(financialGoal.name, g.name)),
      columns: { id: true },
    });
    if (existing) {
      await ctx.db
        .update(financialGoal)
        .set({
          targetCents: g.targetCents,
          currency: g.currency,
          targetDate: g.targetDate ?? null,
          epicId,
          notes: g.notes ?? null,
        })
        .where(eq(financialGoal.id, existing.id));
    } else {
      await ctx.db.insert(financialGoal).values({
        userId,
        name: g.name,
        targetCents: g.targetCents,
        currentCents: g.currentCents,
        currency: g.currency,
        targetDate: g.targetDate ?? null,
        epicId,
        status: g.status,
        notes: g.notes ?? null,
      });
      created.goals += 1;
    }
  }

  let preferences = 0;
  if (profile.preferences) {
    await ctx.db
      .insert(userPreference)
      .values({ userId, ...profile.preferences })
      .onConflictDoUpdate({
        target: userPreference.userId,
        set: { ...profile.preferences, updatedAt: new Date() },
      });
    preferences = 1;
  }

  // `updated` = total entities updated in place (vs the per-kind `created`
  // counts). Kept a single number so the result stays a flat Record<string,number>.
  const updatedTotal =
    updated.categories + updated.skills + updated.epics + updated.milestones + updated.quests;
  return { ...created, preferences, updated: updatedTotal };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Directory where local auto-backups are written (~/Questline Backups). */
function backupDir(): string {
  return path.join(os.homedir(), "Questline Backups");
}

/** Keep only the newest `keep` *.json snapshots; delete older ones. */
async function pruneBackups(dir: string, keep: number): Promise<void> {
  try {
    const files = (await fs.readdir(dir))
      .filter((f) => f.startsWith("questline-") && f.endsWith(".json"))
      .sort(); // timestamped names sort chronologically
    const stale = files.slice(0, Math.max(0, files.length - keep));
    await Promise.all(stale.map((f) => fs.rm(path.join(dir, f), { force: true })));
  } catch {
    /* best-effort */
  }
}

/** Build the full profile snapshot for `userId`. Shared by export + backup. */
async function buildProfile(db: DB, userId: string): Promise<ProfileJson> {
    const [
      categories,
      skills,
      epics,
      quests,
      schedules,
      blocks,
      accounts,
      bills,
      goals,
      prefs,
      skillEdges,
    ] = await Promise.all([
        db.query.category.findMany({ where: eq(category.userId, userId) }),
        db.query.skill.findMany({ where: eq(skill.userId, userId) }),
        db.query.epic.findMany({
          where: eq(epic.userId, userId),
          with: {
            category: true,
            milestones: {
              with: {
                steps: true,
                resources: true,
                skills: { with: { skill: true } },
              },
            },
          },
        }),
        db.query.quest.findMany({
          where: eq(quest.userId, userId),
          with: { skill: true },
        }),
        db.query.scheduleProfile.findMany({
          where: eq(scheduleProfile.userId, userId),
        }),
        db.query.calendarBlock.findMany({
          where: eq(calendarBlock.userId, userId),
        }),
        db.query.financialAccount.findMany({
          where: eq(financialAccount.userId, userId),
        }),
        db.query.recurringBill.findMany({
          where: eq(recurringBill.userId, userId),
        }),
        db.query.financialGoal.findMany({
          where: eq(financialGoal.userId, userId),
          with: { epic: true },
        }),
        db.query.userPreference.findFirst({
          where: eq(userPreference.userId, userId),
        }),
        db.query.skillPrerequisite.findMany({
          where: eq(skillPrerequisite.userId, userId),
          columns: { skillId: true, requiredSkillId: true },
        }),
      ]);

    // skillId → name, and skillId → list of prerequisite names.
    const skillNameById = new Map(skills.map((s) => [s.id, s.name]));
    const requiresBySkill = new Map<string, string[]>();
    for (const e of skillEdges) {
      const reqName = skillNameById.get(e.requiredSkillId);
      if (!reqName) continue;
      const arr = requiresBySkill.get(e.skillId) ?? [];
      arr.push(reqName);
      requiresBySkill.set(e.skillId, arr);
    }

    // Milestone → milestone prerequisites, emitted as portable refs (key||title).
    const allMs = epics.flatMap((e) => e.milestones);
    const msRef = new Map(allMs.map((m) => [m.id, m.key ?? m.title] as const));
    const msIds = allMs.map((m) => m.id);
    const prereqRows = msIds.length
      ? await db.query.prerequisite.findMany({
          where: and(
            inArray(prerequisite.milestoneId, msIds),
            isNotNull(prerequisite.requiredMilestoneId),
          ),
          columns: { milestoneId: true, requiredMilestoneId: true },
        })
      : [];
    const requiresByMs = new Map<string, string[]>();
    for (const p of prereqRows) {
      const ref = p.requiredMilestoneId ? msRef.get(p.requiredMilestoneId) : undefined;
      if (!ref) continue;
      const arr = requiresByMs.get(p.milestoneId) ?? [];
      arr.push(ref);
      requiresByMs.set(p.milestoneId, arr);
    }

    const profile: ProfileJson = {
      exportedAt: new Date().toISOString(),
      version: 1,
      categories: categories.map((c) => ({
        name: c.name,
        color: c.color,
        icon: c.icon ?? null,
      })),
      skills: skills.map((s) => ({
        key: s.key ?? null,
        name: s.name,
        description: s.description ?? null,
        targetDate: s.targetDate ?? null,
        domain: s.domain ?? null,
        requires: requiresBySkill.get(s.id) ?? [],
      })),
      epics: epics.map((e) => ({
        key: e.key ?? null,
        title: e.title,
        description: e.description ?? null,
        status: e.status,
        targetDate: e.targetDate ?? null,
        category: e.category?.name ?? null,
        milestones: e.milestones.map((m) => ({
          key: m.key ?? null,
          title: m.title,
          description: m.description ?? null,
          status: m.status,
          tier: m.tier,
          position: m.position,
          estimatedStartDate: m.estimatedStartDate ?? null,
          estimatedAchievementDate: m.estimatedAchievementDate ?? null,
          estimatedHours: m.estimatedHours ?? null,
          skills: m.skills.map((ms) => ms.skill.name),
          requires: requiresByMs.get(m.id) ?? [],
          steps: m.steps.map((s) => ({
            title: s.title,
            description: s.description ?? null,
            isCompleted: s.isCompleted,
            dueDate: s.dueDate ?? null,
            estimatedMinutes: s.estimatedMinutes ?? null,
          })),
          resources: m.resources.map((r) => ({
            kind: r.kind,
            label: r.label,
            url: r.url ?? null,
            notes: r.notes ?? null,
            acquired: r.acquired,
          })),
        })),
      })),
      quests: quests.map((q) => ({
        key: q.key ?? null,
        title: q.title,
        description: q.description ?? null,
        cadence: q.cadence as "daily" | "weekly" | "one_off",
        xpReward: q.xpReward,
        skill: q.skill?.name ?? null,
        difficulty: (q.difficulty as "trivial" | "normal" | "hard" | null) ?? null,
        expiresAt: q.expiresAt?.toISOString() ?? null,
        startDate: q.startDate ?? null,
        endDate: q.endDate ?? null,
        timesPerPeriod: q.timesPerPeriod ?? null,
      })),
      schedules: schedules.map((s) => ({
        key: s.key ?? null,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        breakStart: s.breakStart ?? null,
        breakEnd: s.breakEnd ?? null,
        days: s.days,
        effectiveFrom: s.effectiveFrom ?? null,
        effectiveTo: s.effectiveTo ?? null,
        color: s.color ?? null,
        priority: s.priority,
        active: s.active,
        notes: s.notes ?? null,
      })),
      calendarBlocks: blocks.map((b) => ({
        key: b.key ?? null,
        title: b.title,
        kind: b.kind as
          | "holiday"
          | "time_off"
          | "travel"
          | "focus"
          | "busy"
          | "custom",
        startDate: b.startDate,
        endDate: b.endDate,
        allDay: b.allDay,
        startTime: b.startTime ?? null,
        endTime: b.endTime ?? null,
        blocksWork: b.blocksWork,
        color: b.color ?? null,
        notes: b.notes ?? null,
      })),
      accounts: accounts.map((a) => ({
        name: a.name,
        kind: a.kind as "asset" | "liability",
        category: a.category,
        balanceCents: a.balanceCents,
        currency: a.currency,
        notes: a.notes ?? null,
      })),
      bills: bills.map((b) => ({
        name: b.name,
        amountCents: b.amountCents,
        currency: b.currency,
        cadence: b.cadence as "weekly" | "monthly" | "yearly",
        category: b.category,
        nextDueDate: b.nextDueDate ?? null,
      })),
      goals: goals.map((g) => ({
        name: g.name,
        targetCents: g.targetCents,
        currentCents: g.currentCents,
        currency: g.currency,
        targetDate: g.targetDate ?? null,
        epic: g.epic?.title ?? null,
        status: g.status as "active" | "achieved" | "abandoned",
        notes: g.notes ?? null,
      })),
      preferences: prefs
        ? {
            workWindowStart: prefs.workWindowStart,
            workWindowEnd: prefs.workWindowEnd,
            workWindowDays: prefs.workWindowDays,
            defaultStepDurationMin: prefs.defaultStepDurationMin,
            aiModel: prefs.aiModel ?? null,
          }
        : null,
    };
    return profile;
}

export const dataioRouter = router({
  // ===== Profile (full backup) =====

  exportProfile: protectedProcedure.query(({ ctx }) =>
    buildProfile(ctx.db, ctx.user.id),
  ),

  /**
   * Write a timestamped snapshot of the full profile to
   * `~/Questline Backups/` and prune to the most recent 20. Local-only file
   * I/O — works in dev and inside the packaged Electron-as-Node server.
   */
  backupNow: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await buildProfile(ctx.db, ctx.user.id);
    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const file = path.join(dir, `questline-${stamp}.json`);
    const json = JSON.stringify(profile, null, 2);
    await fs.writeFile(file, json, "utf8");
    await pruneBackups(dir, 20);
    return { path: file, bytes: Buffer.byteLength(json), at: new Date().toISOString() };
  }),

  importProfile: protectedProcedure
    .input(
      z.object({
        profile: ProfileJson,
        // merge  → add only, skip existing (default; never deletes)
        // upsert → match by key→name/title, update in place + add new (no deletes)
        // replace→ wipe the user's data first, then insert
        mode: z.enum(["merge", "replace", "upsert"]).default("merge"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { profile, mode } = input;
      const userId = ctx.user.id;

      // Idempotent path: update-in-place + add-new, preserving live progress.
      if (mode === "upsert") {
        return upsertProfile({ db: ctx.db, user: { id: userId } }, profile);
      }

      if (mode === "replace") {
        // CASCADE delete order is mostly handled by FKs, but we explicit-delete
        // top-level user-scoped tables to avoid accidents.
        await ctx.db.delete(financialGoal).where(eq(financialGoal.userId, userId));
        await ctx.db.delete(recurringBill).where(eq(recurringBill.userId, userId));
        await ctx.db
          .delete(financialAccount)
          .where(eq(financialAccount.userId, userId));
        await ctx.db.delete(scheduleProfile).where(eq(scheduleProfile.userId, userId));
        await ctx.db.delete(calendarBlock).where(eq(calendarBlock.userId, userId));
        await ctx.db.delete(quest).where(eq(quest.userId, userId));
        // Deleting epics cascades to milestones, steps, resources, prereqs.
        await ctx.db.delete(epic).where(eq(epic.userId, userId));
        await ctx.db.delete(skill).where(eq(skill.userId, userId));
        await ctx.db.delete(category).where(eq(category.userId, userId));
      }

      const counts = {
        categories: 0,
        skills: 0,
        epics: 0,
        milestones: 0,
        quests: 0,
        steps: 0,
        resources: 0,
        schedules: 0,
        calendarBlocks: 0,
        accounts: 0,
        bills: 0,
        goals: 0,
        preferences: 0,
      };

      // Categories first (so epics can reference them by name)
      for (const c of profile.categories) {
        const existing = await ctx.db.query.category.findFirst({
          where: and(
            eq(category.userId, userId),
            eq(category.name, c.name),
          ),
          columns: { id: true },
        });
        if (!existing) {
          await ctx.db
            .insert(category)
            .values({ userId, name: c.name, color: c.color, icon: c.icon ?? null });
          counts.categories += 1;
        }
      }

      // Skills (epics + quests reference these)
      for (const s of profile.skills) {
        const existing = await ctx.db.query.skill.findFirst({
          where: and(eq(skill.userId, userId), eq(skill.name, s.name)),
          columns: { id: true },
        });
        if (!existing) {
          await ctx.db.insert(skill).values({
            userId,
            key: s.key ?? null,
            name: s.name,
            description: s.description ?? null,
            targetDate: s.targetDate ?? null,
            domain: s.domain ?? null,
          });
          counts.skills += 1;
        }
      }

      // Skill Constellation edges (resolve `requires` names → ids, cycle-safe).
      const ownSkills = await ctx.db.query.skill.findMany({
        where: eq(skill.userId, userId),
        columns: { id: true, name: true },
      });
      const skillIdByName = new Map(
        ownSkills.map((s) => [s.name.toLowerCase(), s.id]),
      );
      const candidates = profile.skills.flatMap((s) => {
        const skillId = skillIdByName.get(s.name.toLowerCase());
        if (!skillId) return [];
        return (s.requires ?? []).flatMap((reqName) => {
          const requiredSkillId = skillIdByName.get(reqName.toLowerCase());
          return requiredSkillId ? [{ skillId, requiredSkillId }] : [];
        });
      });
      if (candidates.length > 0) {
        const existingEdges = await ctx.db.query.skillPrerequisite.findMany({
          where: eq(skillPrerequisite.userId, userId),
          columns: { skillId: true, requiredSkillId: true },
        });
        const safe = planSkillLinks(
          existingEdges,
          candidates,
          new Set(ownSkills.map((s) => s.id)),
        );
        if (safe.length > 0) {
          await ctx.db
            .insert(skillPrerequisite)
            .values(safe.map((e) => ({ userId, ...e })))
            .onConflictDoNothing();
        }
      }

      // Epics (with milestones nested)
      for (const e of profile.epics) {
        const categoryId = await resolveCategoryByName(ctx, e.category);
        const [created] = await ctx.db
          .insert(epic)
          .values({
            userId,
            key: e.key ?? null,
            title: e.title,
            description: e.description ?? null,
            status: e.status,
            targetDate: e.targetDate ?? null,
            categoryId,
          })
          .returning({ id: epic.id });
        counts.epics += 1;
        for (const m of e.milestones) {
          await insertMilestone(ctx, created.id, m);
          counts.milestones += 1;
          counts.steps += m.steps.length;
          counts.resources += m.resources.length;
        }
      }

      // Milestone → milestone prerequisites (after all milestones exist).
      await applyMilestoneRequires(ctx, userId, profile);

      // Quests
      for (const q of profile.quests) {
        const skillId = await resolveSkillByName(ctx, q.skill);
        await ctx.db.insert(quest).values({
          userId,
          key: q.key ?? null,
          title: q.title,
          description: q.description ?? null,
          cadence: q.cadence,
          xpReward: q.xpReward,
          skillId,
          difficulty: q.difficulty ?? null,
          expiresAt: q.expiresAt ? new Date(q.expiresAt) : null,
          startDate: q.startDate ?? null,
          endDate: q.endDate ?? null,
          timesPerPeriod: q.timesPerPeriod ?? null,
        });
        counts.quests += 1;
      }

      // Schedule profiles
      for (const s of profile.schedules) {
        await ctx.db.insert(scheduleProfile).values({
          userId,
          key: s.key ?? null,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          breakStart: s.breakStart ?? null,
          breakEnd: s.breakEnd ?? null,
          days: s.days,
          effectiveFrom: s.effectiveFrom ?? null,
          effectiveTo: s.effectiveTo ?? null,
          color: s.color ?? null,
          priority: s.priority,
          active: s.active,
          notes: s.notes ?? null,
        });
        counts.schedules += 1;
      }

      // Calendar blocks
      for (const b of profile.calendarBlocks) {
        await ctx.db.insert(calendarBlock).values({
          userId,
          key: b.key ?? null,
          title: b.title,
          kind: b.kind,
          startDate: b.startDate,
          endDate: b.endDate,
          allDay: b.allDay,
          startTime: b.startTime ?? null,
          endTime: b.endTime ?? null,
          blocksWork: b.blocksWork,
          color: b.color ?? null,
          notes: b.notes ?? null,
        });
        counts.calendarBlocks += 1;
      }

      // Accounts
      for (const a of profile.accounts) {
        await ctx.db.insert(financialAccount).values({ userId, ...a });
        counts.accounts += 1;
      }

      // Bills
      for (const b of profile.bills) {
        await ctx.db.insert(recurringBill).values({
          userId,
          name: b.name,
          amountCents: b.amountCents,
          currency: b.currency,
          cadence: b.cadence,
          category: b.category,
          nextDueDate: b.nextDueDate ?? null,
        });
        counts.bills += 1;
      }

      // Goals
      for (const g of profile.goals) {
        const epicId = await resolveEpicByTitle(ctx, g.epic);
        await ctx.db.insert(financialGoal).values({
          userId,
          name: g.name,
          targetCents: g.targetCents,
          currentCents: g.currentCents,
          currency: g.currency,
          targetDate: g.targetDate ?? null,
          epicId,
          status: g.status,
          notes: g.notes ?? null,
        });
        counts.goals += 1;
      }

      // Preferences (single row, upsert)
      if (profile.preferences) {
        await ctx.db
          .insert(userPreference)
          .values({ userId, ...profile.preferences })
          .onConflictDoUpdate({
            target: userPreference.userId,
            set: { ...profile.preferences, updatedAt: new Date() },
          });
        counts.preferences = 1;
      }

      // merge/replace only ever creates → nothing updated in place.
      return { ...counts, updated: 0 };
    }),

  // ===== Trophy Room (export-only — completed epics with their sigil seed) =====

  /**
   * §6 — Export the user's completed Epics ("trophies") as a portable JSON
   * snapshot. Each entry is the standard Epic shape (so the file is
   * import-compatible), plus the `completedAt` timestamp + `milestoneCount`
   * for convenience. The sigil SVG is regenerated deterministically at
   * render time from the epic's id+title, so we don't need to store it.
   */
  exportTrophies: protectedProcedure.query(async ({ ctx }) => {
    const completed = await ctx.db.query.epic.findMany({
      where: and(
        eq(epic.userId, ctx.user.id),
        eq(epic.status, "completed"),
      ),
      with: {
        category: true,
        milestones: {
          with: {
            steps: true,
            resources: true,
            skills: { with: { skill: true } },
          },
        },
      },
    });
    return {
      exportedAt: new Date().toISOString(),
      kind: "trophy_room" as const,
      version: 1 as const,
      trophies: completed.map((e) => ({
        title: e.title,
        description: e.description ?? null,
        category: e.category?.name ?? null,
        completedAt: e.completedAt?.toISOString() ?? null,
        milestoneCount: e.milestones.length,
        milestones: e.milestones.map((m) => ({
          title: m.title,
          description: m.description ?? null,
          tier: m.tier,
          completedAt: m.completedAt?.toISOString() ?? null,
          skills: m.skills.map((ms) => ms.skill.name),
          steps: m.steps.map((s) => ({
            title: s.title,
            isCompleted: s.isCompleted,
          })),
          resources: m.resources.map((r) => ({
            kind: r.kind,
            label: r.label,
            url: r.url ?? null,
          })),
        })),
      })),
    };
  }),

  // ===== Per-entity =====

  exportEpic: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.epic.findFirst({
        where: and(eq(epic.id, input.id), eq(epic.userId, ctx.user.id)),
        with: {
          category: true,
          milestones: {
            with: {
              steps: true,
              resources: true,
              skills: { with: { skill: true } },
            },
          },
        },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const out: EpicJson = {
        title: row.title,
        description: row.description ?? null,
        status: row.status,
        targetDate: row.targetDate ?? null,
        category: row.category?.name ?? null,
        milestones: row.milestones.map((m) => ({
          title: m.title,
          description: m.description ?? null,
          status: m.status,
          tier: m.tier,
          position: m.position,
          estimatedStartDate: m.estimatedStartDate ?? null,
          estimatedAchievementDate: m.estimatedAchievementDate ?? null,
          skills: m.skills.map((ms) => ms.skill.name),
          steps: m.steps.map((s) => ({
            title: s.title,
            description: s.description ?? null,
            isCompleted: s.isCompleted,
            dueDate: s.dueDate ?? null,
          })),
          resources: m.resources.map((r) => ({
            kind: r.kind,
            label: r.label,
            url: r.url ?? null,
            notes: r.notes ?? null,
            acquired: r.acquired,
          })),
        })),
      };
      return out;
    }),

  importEpic: protectedProcedure
    .input(z.object({ json: EpicJson }))
    .mutation(async ({ ctx, input }) => {
      const e = input.json;
      const categoryId = await resolveCategoryByName(ctx, e.category);
      const [created] = await ctx.db
        .insert(epic)
        .values({
          userId: ctx.user.id,
          title: e.title,
          description: e.description ?? null,
          status: e.status,
          targetDate: e.targetDate ?? null,
          categoryId,
        })
        .returning({ id: epic.id });
      for (const m of e.milestones) {
        await insertMilestone(ctx, created.id, m);
      }
      return { id: created.id, milestoneCount: e.milestones.length };
    }),

  // Milestone import attaches to an Epic specified by title.
  importMilestone: protectedProcedure
    .input(z.object({ epicTitle: z.string(), json: MilestoneJson }))
    .mutation(async ({ ctx, input }) => {
      const epicId = await resolveEpicByTitle(ctx, input.epicTitle);
      if (!epicId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No Epic titled "${input.epicTitle}". Create it first.`,
        });
      }
      const id = await insertMilestone(ctx, epicId, input.json);
      return { id };
    }),

  importCategory: protectedProcedure
    .input(z.object({ json: CategoryJson }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(category)
        .values({ userId: ctx.user.id, ...input.json })
        .onConflictDoNothing();
      return { success: true };
    }),

  importSkill: protectedProcedure
    .input(z.object({ json: SkillJson }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(skill)
        .values({
          userId: ctx.user.id,
          name: input.json.name,
          description: input.json.description ?? null,
          targetDate: input.json.targetDate ?? null,
          domain: input.json.domain ?? null,
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  importQuest: protectedProcedure
    .input(z.object({ json: QuestJson }))
    .mutation(async ({ ctx, input }) => {
      const q = input.json;
      const skillId = await resolveSkillByName(ctx, q.skill);
      const [created] = await ctx.db
        .insert(quest)
        .values({
          userId: ctx.user.id,
          title: q.title,
          description: q.description ?? null,
          cadence: q.cadence,
          xpReward: q.xpReward,
          skillId,
          difficulty: q.difficulty ?? null,
          expiresAt: q.expiresAt ? new Date(q.expiresAt) : null,
        })
        .returning({ id: quest.id });
      return { id: created.id };
    }),

  importAccount: protectedProcedure
    .input(z.object({ json: AccountJson }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(financialAccount)
        .values({ userId: ctx.user.id, ...input.json })
        .returning({ id: financialAccount.id });
      return { id: created.id };
    }),

  importBill: protectedProcedure
    .input(z.object({ json: BillJson }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(recurringBill)
        .values({
          userId: ctx.user.id,
          name: input.json.name,
          amountCents: input.json.amountCents,
          currency: input.json.currency,
          cadence: input.json.cadence,
          category: input.json.category,
          nextDueDate: input.json.nextDueDate ?? null,
        })
        .returning({ id: recurringBill.id });
      return { id: created.id };
    }),

  importGoal: protectedProcedure
    .input(z.object({ json: GoalJson }))
    .mutation(async ({ ctx, input }) => {
      const g = input.json;
      const epicId = await resolveEpicByTitle(ctx, g.epic);
      const [created] = await ctx.db
        .insert(financialGoal)
        .values({
          userId: ctx.user.id,
          name: g.name,
          targetCents: g.targetCents,
          currentCents: g.currentCents,
          currency: g.currency,
          targetDate: g.targetDate ?? null,
          epicId,
          status: g.status,
          notes: g.notes ?? null,
        })
        .returning({ id: financialGoal.id });
      return { id: created.id };
    }),

  importPreferences: protectedProcedure
    .input(z.object({ json: PreferencesJson }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id, ...input.json })
        .onConflictDoUpdate({
          target: userPreference.userId,
          set: { ...input.json, updatedAt: new Date() },
        });
      return { success: true };
    }),

  /**
   * "Restart Game" — reset all progress while keeping the structure. Every
   * Epic and Milestone goes back to not_started (timestamps cleared) and
   * every Step is un-checked. Skills, which derive XP from completed
   * milestones, drop back to Lv 0 automatically. Categories, deadlines,
   * resources, quests, and finances are untouched.
   */
  restartGame: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Snapshot only the rows that HAD progress, so Undo can restore them.
    const epicsBefore = await ctx.db.query.epic.findMany({
      where: eq(epic.userId, userId),
      columns: { id: true, status: true, startedAt: true, completedAt: true },
    });
    const epicIds = epicsBefore.map((e) => e.id);
    const msBefore = epicIds.length
      ? await ctx.db.query.milestone.findMany({
          where: inArray(milestone.epicId, epicIds),
          columns: { id: true, status: true, completedAt: true },
        })
      : [];
    const msIds = msBefore.map((m) => m.id);
    const stepsBefore = msIds.length
      ? await ctx.db.query.step.findMany({
          where: inArray(step.milestoneId, msIds),
          columns: { id: true, isCompleted: true, completedAt: true },
        })
      : [];

    const snapshot = {
      epics: epicsBefore
        .filter((e) => e.status !== "not_started")
        .map((e) => ({
          id: e.id,
          status: e.status,
          startedAt: e.startedAt?.toISOString() ?? null,
          completedAt: e.completedAt?.toISOString() ?? null,
        })),
      milestones: msBefore
        .filter((m) => m.status !== "not_started")
        .map((m) => ({
          id: m.id,
          status: m.status,
          completedAt: m.completedAt?.toISOString() ?? null,
        })),
      steps: stepsBefore
        .filter((s) => s.isCompleted)
        .map((s) => ({ id: s.id, completedAt: s.completedAt?.toISOString() ?? null })),
    };

    // Reset everything.
    if (epicIds.length > 0)
      await ctx.db
        .update(epic)
        .set({ status: "not_started", startedAt: null, completedAt: null, updatedAt: new Date() })
        .where(eq(epic.userId, userId));
    if (msIds.length > 0)
      await ctx.db
        .update(milestone)
        .set({ status: "not_started", completedAt: null, updatedAt: new Date() })
        .where(inArray(milestone.epicId, epicIds));
    if (msIds.length > 0)
      await ctx.db
        .update(step)
        .set({ isCompleted: false, completedAt: null })
        .where(inArray(step.milestoneId, msIds));

    return {
      epics: epicIds.length,
      milestones: msIds.length,
      steps: stepsBefore.length,
      snapshot,
    };
  }),

  /** Re-apply a snapshot from restartGame (the Undo path). User-scoped. */
  restoreGameSnapshot: protectedProcedure
    .input(
      z.object({
        snapshot: z.object({
          epics: z.array(
            z.object({
              id: z.string().uuid(),
              status: z.enum(["not_started", "in_progress", "completed", "paused", "abandoned"]),
              startedAt: z.string().nullable(),
              completedAt: z.string().nullable(),
            }),
          ),
          milestones: z.array(
            z.object({
              id: z.string().uuid(),
              status: z.enum(["not_started", "in_progress", "completed", "paused", "abandoned"]),
              completedAt: z.string().nullable(),
            }),
          ),
          steps: z.array(
            z.object({ id: z.string().uuid(), completedAt: z.string().nullable() }),
          ),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const ownEpics = new Set(
        (await ctx.db.query.epic.findMany({ where: eq(epic.userId, userId), columns: { id: true } })).map((e) => e.id),
      );
      const ownMs = new Set(
        ownEpics.size
          ? (await ctx.db.query.milestone.findMany({ where: inArray(milestone.epicId, [...ownEpics]), columns: { id: true } })).map((m) => m.id)
          : [],
      );
      const ownSteps = new Set(
        ownMs.size
          ? (await ctx.db.query.step.findMany({ where: inArray(step.milestoneId, [...ownMs]), columns: { id: true } })).map((s) => s.id)
          : [],
      );
      let restored = 0;
      for (const e of input.snapshot.epics) {
        if (!ownEpics.has(e.id)) continue;
        await ctx.db
          .update(epic)
          .set({
            status: e.status,
            startedAt: e.startedAt ? new Date(e.startedAt) : null,
            completedAt: e.completedAt ? new Date(e.completedAt) : null,
            updatedAt: new Date(),
          })
          .where(eq(epic.id, e.id));
        restored++;
      }
      for (const m of input.snapshot.milestones) {
        if (!ownMs.has(m.id)) continue;
        await ctx.db
          .update(milestone)
          .set({ status: m.status, completedAt: m.completedAt ? new Date(m.completedAt) : null, updatedAt: new Date() })
          .where(eq(milestone.id, m.id));
        restored++;
      }
      for (const s of input.snapshot.steps) {
        if (!ownSteps.has(s.id)) continue;
        await ctx.db
          .update(step)
          .set({ isCompleted: true, completedAt: s.completedAt ? new Date(s.completedAt) : null })
          .where(eq(step.id, s.id));
        restored++;
      }
      return { restored };
    }),

  /**
   * New Game — permanently delete ALL of the user's content (epics, milestones,
   * steps, resources, skills, categories, quests, chapter board, finances,
   * external calendars, retrospectives). Auth + onboarding preferences and the
   * calendar-feed token are kept so the account stays usable. Irreversible —
   * the UI confirms and offers a backup export first.
   */
  newGame: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Each delete cascades to its children (epic → milestones → steps/resources/
    // prereqs, skill → prerequisites, quest → completions, chapter → board nodes,
    // source → external events), so order is independent.
    const goals = await ctx.db
      .delete(financialGoal)
      .where(eq(financialGoal.userId, userId))
      .returning({ id: financialGoal.id });
    const bills = await ctx.db
      .delete(recurringBill)
      .where(eq(recurringBill.userId, userId))
      .returning({ id: recurringBill.id });
    const accounts = await ctx.db
      .delete(financialAccount)
      .where(eq(financialAccount.userId, userId))
      .returning({ id: financialAccount.id });
    const quests = await ctx.db
      .delete(quest)
      .where(eq(quest.userId, userId))
      .returning({ id: quest.id });
    const chapters = await ctx.db
      .delete(chapter)
      .where(eq(chapter.userId, userId))
      .returning({ id: chapter.id });
    await ctx.db
      .delete(externalCalendarSource)
      .where(eq(externalCalendarSource.userId, userId));
    await ctx.db
      .delete(weeklyRetrospective)
      .where(eq(weeklyRetrospective.userId, userId));
    await ctx.db
      .delete(notificationLog)
      .where(eq(notificationLog.userId, userId));
    const epics = await ctx.db
      .delete(epic)
      .where(eq(epic.userId, userId))
      .returning({ id: epic.id });
    const skills = await ctx.db
      .delete(skill)
      .where(eq(skill.userId, userId))
      .returning({ id: skill.id });
    const categories = await ctx.db
      .delete(category)
      .where(eq(category.userId, userId))
      .returning({ id: category.id });

    return {
      epics: epics.length,
      skills: skills.length,
      categories: categories.length,
      quests: quests.length,
      chapters: chapters.length,
      accounts: accounts.length,
      bills: bills.length,
      goals: goals.length,
    };
  }),
});
