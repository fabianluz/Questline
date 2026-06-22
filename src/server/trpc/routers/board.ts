import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  boardNode,
  chapter,
  epic,
  milestone,
  quest,
} from "@/server/db/schema";
import { ChapterBoardJson } from "@/lib/json-shapes";
import { planChapterLayout } from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

/**
 * JRPG chapter board — order-of-life-phases overlay on existing entities.
 *
 * The router exposes:
 *   - listBoard            : chapters in order + nodes grouped by chapter,
 *                            with the referenced Epic/Milestone/Quest
 *                            hydrated (title, status, etc.).
 *   - createChapter        : append a new chapter at the end.
 *   - updateChapter        : title / color / notes.
 *   - reorderChapters      : full chapter ordering (array of ids in order).
 *   - deleteChapter        : also drops its nodes (cascade).
 *   - addNode              : pick an existing Epic/Milestone/Quest and
 *                            place it in a chapter at a given tier/pos.
 *   - moveNode             : reassign chapterId / tier / position. Used by
 *                            the drag-and-drop UI.
 *   - removeNode           : pull a node off the board (entity untouched).
 *
 * IMPORTANT: deleting an entity (epic/milestone/quest) from elsewhere in
 * the app does NOT cascade to board_node rows — `refId` is intentionally
 * not a FK so we can show "(deleted)" cards instead of silently dropping
 * planning state. `listBoard` flags these via the `missing: true` field.
 */

const kindSchema = z.enum(["epic", "milestone", "quest"]);

export const boardRouter = router({
  // ─────────────────────────────────────────────────────────────────
  // Read

  listBoard: protectedProcedure.query(async ({ ctx }) => {
    const chapters = await ctx.db.query.chapter.findMany({
      where: eq(chapter.userId, ctx.user.id),
      orderBy: [asc(chapter.position), asc(chapter.createdAt)],
    });
    const nodes = await ctx.db.query.boardNode.findMany({
      where: eq(boardNode.userId, ctx.user.id),
      orderBy: [asc(boardNode.tier), asc(boardNode.position)],
    });

    // Bulk-hydrate the referenced entities so the client can render
    // titles + status without N+1 queries.
    const epicIds = new Set<string>();
    const milestoneIds = new Set<string>();
    const questIds = new Set<string>();
    for (const n of nodes) {
      if (n.kind === "epic") epicIds.add(n.refId);
      else if (n.kind === "milestone") milestoneIds.add(n.refId);
      else if (n.kind === "quest") questIds.add(n.refId);
    }

    const [epics, milestones, quests] = await Promise.all([
      epicIds.size > 0
        ? ctx.db.query.epic.findMany({
            where: and(
              eq(epic.userId, ctx.user.id),
              inArray(epic.id, [...epicIds]),
            ),
            with: { category: true },
          })
        : Promise.resolve([]),
      milestoneIds.size > 0
        ? ctx.db.query.milestone.findMany({
            where: inArray(milestone.id, [...milestoneIds]),
            with: {
              epic: { columns: { title: true, userId: true } },
              steps: { columns: { isCompleted: true } },
            },
          })
        : Promise.resolve([]),
      questIds.size > 0
        ? ctx.db.query.quest.findMany({
            where: and(
              eq(quest.userId, ctx.user.id),
              inArray(quest.id, [...questIds]),
            ),
          })
        : Promise.resolve([]),
    ]);

    const epicById = new Map(epics.map((e) => [e.id, e]));
    const milestoneById = new Map(
      milestones
        .filter((m) => m.epic.userId === ctx.user.id)
        .map((m) => [m.id, m]),
    );
    const questById = new Map(quests.map((q) => [q.id, q]));

    return {
      chapters: chapters.map((c) => ({
        id: c.id,
        title: c.title,
        position: c.position,
        color: c.color,
        notes: c.notes,
      })),
      nodes: nodes.map((n) => {
        let title = "(deleted)";
        let status: string | null = null;
        let extra: Record<string, unknown> = {};
        let missing = true;
        // Planned window + step progress surfaced for the board's card visuals.
        let startDate: string | null = null;
        let deadline: string | null = null;
        let stepsDone = 0;
        let stepsTotal = 0;
        if (n.kind === "epic") {
          const e = epicById.get(n.refId);
          if (e) {
            title = e.title;
            status = e.status;
            deadline = e.targetDate ?? null;
            extra = {
              // The epic IS its own group anchor — surface its id + title so
              // the board can colour-group cards by epic and detect epics
              // that span multiple chapters.
              epicId: e.id,
              epicTitle: e.title,
              categoryName: e.category?.name ?? null,
              categoryColor: e.category?.color ?? null,
              description: e.description ?? null,
            };
            missing = false;
          }
        } else if (n.kind === "milestone") {
          const m = milestoneById.get(n.refId);
          if (m) {
            title = m.title;
            status = m.status;
            startDate = m.estimatedStartDate ?? null;
            deadline = m.estimatedAchievementDate ?? null;
            stepsTotal = m.steps.length;
            stepsDone = m.steps.filter((s) => s.isCompleted).length;
            // epicId links this milestone to its parent epic so cards that
            // belong to the same epic (across chapters) share a colour.
            extra = {
              epicId: m.epicId,
              epicTitle: m.epic.title,
              milestoneTier: m.tier,
              description: m.description ?? null,
            };
            missing = false;
          }
        } else if (n.kind === "quest") {
          const q = questById.get(n.refId);
          if (q) {
            title = q.title;
            status = q.archived ? "archived" : "active";
            deadline = q.expiresAt
              ? q.expiresAt.toISOString().slice(0, 10)
              : null;
            extra = {
              cadence: q.cadence,
              xpReward: q.xpReward,
              difficulty: q.difficulty ?? null,
              description: q.description ?? null,
            };
            missing = false;
          }
        }
        return {
          id: n.id,
          chapterId: n.chapterId,
          kind: n.kind,
          refId: n.refId,
          tier: n.tier,
          position: n.position,
          notes: n.notes,
          title,
          status,
          missing,
          startDate,
          deadline,
          stepsDone,
          stepsTotal,
          extra,
        };
      }),
    };
  }),

  /**
   * "What can I add" — EVERY entity, annotated with how many times it's
   * already on the board (`placedCount`). We intentionally do NOT hide
   * already-placed entities: an Epic (or any card) can live in more than one
   * chapter — e.g. a long epic whose milestones span the whole journey. The
   * UI shows an "on board" badge so the user knows it's a repeat placement.
   */
  pickerOptions: protectedProcedure.query(async ({ ctx }) => {
    const placed = await ctx.db.query.boardNode.findMany({
      where: eq(boardNode.userId, ctx.user.id),
      columns: { kind: true, refId: true },
    });
    const placedCount = new Map<string, number>();
    for (const p of placed) {
      const k = `${p.kind}:${p.refId}`;
      placedCount.set(k, (placedCount.get(k) ?? 0) + 1);
    }

    const [epics, milestones, quests] = await Promise.all([
      ctx.db.query.epic.findMany({
        where: eq(epic.userId, ctx.user.id),
        columns: { id: true, title: true, status: true },
        orderBy: [asc(epic.title)],
      }),
      ctx.db.query.milestone.findMany({
        with: { epic: { columns: { title: true, userId: true } } },
        orderBy: [asc(milestone.title)],
      }),
      ctx.db.query.quest.findMany({
        where: and(eq(quest.userId, ctx.user.id), eq(quest.archived, false)),
        columns: { id: true, title: true, cadence: true },
        orderBy: [asc(quest.title)],
      }),
    ]);

    return {
      epics: epics.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        placedCount: placedCount.get(`epic:${e.id}`) ?? 0,
      })),
      milestones: milestones
        .filter((m) => m.epic.userId === ctx.user.id)
        .map((m) => ({
          id: m.id,
          title: m.title,
          epicTitle: m.epic.title,
          placedCount: placedCount.get(`milestone:${m.id}`) ?? 0,
        })),
      quests: quests.map((q) => ({
        id: q.id,
        title: q.title,
        cadence: q.cadence,
        placedCount: placedCount.get(`quest:${q.id}`) ?? 0,
      })),
    };
  }),

  // ─────────────────────────────────────────────────────────────────
  // Chapters

  createChapter: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(80).default("New chapter"),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.chapter.findMany({
        where: eq(chapter.userId, ctx.user.id),
        columns: { position: true },
      });
      const nextPos =
        existing.length === 0
          ? 0
          : Math.max(...existing.map((e) => e.position)) + 1;
      const [created] = await ctx.db
        .insert(chapter)
        .values({
          userId: ctx.user.id,
          title: input.title,
          color: input.color ?? null,
          position: nextPos,
        })
        .returning();
      return created;
    }),

  updateChapter: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(80).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsChapter(ctx, input.id);
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(chapter)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(chapter.id, id))
        .returning();
      return updated;
    }),

  reorderChapters: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Quick scope check: every id must belong to the user.
      const owned = await ctx.db.query.chapter.findMany({
        where: and(
          eq(chapter.userId, ctx.user.id),
          inArray(chapter.id, input.ids),
        ),
        columns: { id: true },
      });
      if (owned.length !== input.ids.length) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      // Persist new positions.
      for (let i = 0; i < input.ids.length; i++) {
        await ctx.db
          .update(chapter)
          .set({ position: i, updatedAt: new Date() })
          .where(eq(chapter.id, input.ids[i]));
      }
      return { success: true };
    }),

  deleteChapter: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsChapter(ctx, input.id);
      await ctx.db.delete(chapter).where(eq(chapter.id, input.id));
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────
  // Nodes

  addNode: protectedProcedure
    .input(
      z.object({
        chapterId: z.string().uuid(),
        kind: kindSchema,
        refId: z.string().uuid(),
        tier: z.number().int().min(0).max(50).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsChapter(ctx, input.chapterId);
      // Place at the end of the tier.
      const peers = await ctx.db.query.boardNode.findMany({
        where: and(
          eq(boardNode.chapterId, input.chapterId),
          eq(boardNode.tier, input.tier),
        ),
        columns: { position: true },
      });
      const nextPos =
        peers.length === 0
          ? 0
          : Math.max(...peers.map((p) => p.position)) + 1;
      const [created] = await ctx.db
        .insert(boardNode)
        .values({
          userId: ctx.user.id,
          chapterId: input.chapterId,
          kind: input.kind,
          refId: input.refId,
          tier: input.tier,
          position: nextPos,
        })
        .returning();
      return created;
    }),

  /**
   * Move a node to (newChapterId, newTier, newPosition). The client passes
   * the target slot; we re-sequence the affected tiers to keep positions
   * dense.
   */
  moveNode: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        toChapterId: z.string().uuid(),
        toTier: z.number().int().min(0).max(50),
        toPosition: z.number().int().min(0).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const node = await ctx.db.query.boardNode.findFirst({
        where: and(
          eq(boardNode.id, input.id),
          eq(boardNode.userId, ctx.user.id),
        ),
      });
      if (!node) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOwnsChapter(ctx, input.toChapterId);

      // 1. Pluck the node out of its current tier (no-op for DB; we just
      //    won't include it when re-sequencing the destination tier).
      // 2. Update the node row to the new chapter / tier with a sentinel
      //    position; we'll fix positions in a follow-up pass.
      await ctx.db
        .update(boardNode)
        .set({
          chapterId: input.toChapterId,
          tier: input.toTier,
          // Sentinel — actual final position assigned below.
          position: 9_999_999,
          updatedAt: new Date(),
        })
        .where(eq(boardNode.id, input.id));

      // 3. Re-sequence the source tier (positions 0..N-1).
      const sourceSiblings = await ctx.db.query.boardNode.findMany({
        where: and(
          eq(boardNode.chapterId, node.chapterId),
          eq(boardNode.tier, node.tier),
        ),
        orderBy: [asc(boardNode.position)],
        columns: { id: true },
      });
      for (let i = 0; i < sourceSiblings.length; i++) {
        await ctx.db
          .update(boardNode)
          .set({ position: i })
          .where(eq(boardNode.id, sourceSiblings[i].id));
      }

      // 4. Re-sequence the destination tier: existing peers + our moved
      //    node, with the moved node slotted into `toPosition`.
      const destSiblings = await ctx.db.query.boardNode.findMany({
        where: and(
          eq(boardNode.chapterId, input.toChapterId),
          eq(boardNode.tier, input.toTier),
        ),
        orderBy: [asc(boardNode.position)],
        columns: { id: true },
      });
      // Remove the moved node from the list (it's there with position
      // 9_999_999 from step 2) and reinsert at `toPosition`.
      const others = destSiblings
        .map((d) => d.id)
        .filter((id) => id !== input.id);
      const clampedPos = Math.min(input.toPosition, others.length);
      const final = [
        ...others.slice(0, clampedPos),
        input.id,
        ...others.slice(clampedPos),
      ];
      for (let i = 0; i < final.length; i++) {
        await ctx.db
          .update(boardNode)
          .set({ position: i })
          .where(eq(boardNode.id, final[i]));
      }
      return { success: true };
    }),

  removeNode: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const node = await ctx.db.query.boardNode.findFirst({
        where: and(
          eq(boardNode.id, input.id),
          eq(boardNode.userId, ctx.user.id),
        ),
      });
      if (!node) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.delete(boardNode).where(eq(boardNode.id, input.id));
      // Re-sequence the now-vacated tier.
      const siblings = await ctx.db.query.boardNode.findMany({
        where: and(
          eq(boardNode.chapterId, node.chapterId),
          eq(boardNode.tier, node.tier),
        ),
        orderBy: [asc(boardNode.position)],
        columns: { id: true },
      });
      for (let i = 0; i < siblings.length; i++) {
        await ctx.db
          .update(boardNode)
          .set({ position: i })
          .where(eq(boardNode.id, siblings[i].id));
      }
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────
  // JSON export / import
  //
  // Round-trip carries BOTH refId (for exact same-DB restore) and refTitle
  // (so portability / LLM-generated JSON resolves on a different machine).
  // Import resolves refId first; falls back to title-match scoped to the
  // user. Unresolved refs are skipped + returned in `report.skipped`.

  exportBoard: protectedProcedure.query(async ({ ctx }) => {
    const chapters = await ctx.db.query.chapter.findMany({
      where: eq(chapter.userId, ctx.user.id),
      orderBy: [asc(chapter.position), asc(chapter.createdAt)],
    });
    const nodes = await ctx.db.query.boardNode.findMany({
      where: eq(boardNode.userId, ctx.user.id),
      orderBy: [asc(boardNode.tier), asc(boardNode.position)],
    });

    // Hydrate titles so the export carries portable refs.
    const epicIds = new Set<string>();
    const milestoneIds = new Set<string>();
    const questIds = new Set<string>();
    for (const n of nodes) {
      if (n.kind === "epic") epicIds.add(n.refId);
      else if (n.kind === "milestone") milestoneIds.add(n.refId);
      else if (n.kind === "quest") questIds.add(n.refId);
    }
    const [epics, milestones, quests] = await Promise.all([
      epicIds.size > 0
        ? ctx.db.query.epic.findMany({
            where: and(
              eq(epic.userId, ctx.user.id),
              inArray(epic.id, [...epicIds]),
            ),
            columns: { id: true, title: true, key: true },
          })
        : Promise.resolve([]),
      milestoneIds.size > 0
        ? ctx.db.query.milestone.findMany({
            where: inArray(milestone.id, [...milestoneIds]),
            with: { epic: { columns: { userId: true } } },
            columns: { id: true, title: true, key: true },
          })
        : Promise.resolve([]),
      questIds.size > 0
        ? ctx.db.query.quest.findMany({
            where: and(
              eq(quest.userId, ctx.user.id),
              inArray(quest.id, [...questIds]),
            ),
            columns: { id: true, title: true, key: true },
          })
        : Promise.resolve([]),
    ]);
    const epicTitle = new Map(epics.map((e) => [e.id, e.title]));
    const milestoneTitle = new Map(
      milestones
        .filter((m) => m.epic.userId === ctx.user.id)
        .map((m) => [m.id, m.title]),
    );
    const questTitle = new Map(quests.map((q) => [q.id, q.title]));
    const keyById = new Map<string, string>([
      ...epics.flatMap((e) => (e.key ? [[e.id, e.key] as const] : [])),
      ...milestones.flatMap((m) => (m.key ? [[m.id, m.key] as const] : [])),
      ...quests.flatMap((q) => (q.key ? [[q.id, q.key] as const] : [])),
    ]);

    const byChapter = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const arr = byChapter.get(n.chapterId) ?? [];
      arr.push(n);
      byChapter.set(n.chapterId, arr);
    }

    return {
      exportedAt: new Date().toISOString(),
      version: 1 as const,
      chapters: chapters.map((c, idx) => ({
        title: c.title,
        color: c.color,
        notes: c.notes,
        position: idx,
        nodes: (byChapter.get(c.id) ?? []).map((n) => ({
          kind: n.kind,
          refId: n.refId,
          refKey: keyById.get(n.refId) ?? null,
          refTitle:
            n.kind === "epic"
              ? epicTitle.get(n.refId) ?? null
              : n.kind === "milestone"
                ? milestoneTitle.get(n.refId) ?? null
                : questTitle.get(n.refId) ?? null,
          tier: n.tier,
          position: n.position,
          notes: n.notes,
        })),
      })),
    };
  }),

  importBoard: protectedProcedure
    .input(
      z.object({
        json: ChapterBoardJson,
        mode: z.enum(["replace", "merge"]).default("merge"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Pre-fetch the user's full entity backlog so we can resolve refs.
      const [allEpics, allMilestones, allQuests] = await Promise.all([
        ctx.db.query.epic.findMany({
          where: eq(epic.userId, ctx.user.id),
          columns: { id: true, title: true, key: true },
        }),
        ctx.db.query.milestone.findMany({
          with: { epic: { columns: { userId: true } } },
          columns: { id: true, title: true, key: true },
        }),
        ctx.db.query.quest.findMany({
          where: eq(quest.userId, ctx.user.id),
          columns: { id: true, title: true, key: true },
        }),
      ]);
      const userMilestones = allMilestones.filter(
        (m) => m.epic.userId === ctx.user.id,
      );
      const epicById = new Map(allEpics.map((e) => [e.id, e]));
      const epicByTitle = new Map(
        allEpics.map((e) => [e.title.toLowerCase(), e]),
      );
      const milestoneById = new Map(userMilestones.map((m) => [m.id, m]));
      const milestoneByTitle = new Map(
        userMilestones.map((m) => [m.title.toLowerCase(), m]),
      );
      const questById = new Map(allQuests.map((q) => [q.id, q]));
      const questByTitle = new Map(
        allQuests.map((q) => [q.title.toLowerCase(), q]),
      );
      const byKey = {
        epic: new Map(allEpics.flatMap((e) => (e.key ? [[e.key, e.id] as const] : []))),
        milestone: new Map(
          userMilestones.flatMap((m) => (m.key ? [[m.key, m.id] as const] : [])),
        ),
        quest: new Map(allQuests.flatMap((q) => (q.key ? [[q.key, q.id] as const] : []))),
      };

      function resolveRef(
        kind: "epic" | "milestone" | "quest",
        refId: string | null | undefined,
        refKey: string | null | undefined,
        refTitle: string | null | undefined,
      ): string | null {
        const byId =
          kind === "epic" ? epicById : kind === "milestone" ? milestoneById : questById;
        const byTitle =
          kind === "epic"
            ? epicByTitle
            : kind === "milestone"
              ? milestoneByTitle
              : questByTitle;
        if (refId && byId.has(refId)) return refId;
        if (refKey) {
          const hit = byKey[kind].get(refKey);
          if (hit) return hit;
        }
        if (refTitle) {
          const hit = byTitle.get(refTitle.toLowerCase());
          if (hit) return hit.id;
        }
        return null;
      }

      if (input.mode === "replace") {
        // Cascades to boardNode via FK.
        await ctx.db.delete(chapter).where(eq(chapter.userId, ctx.user.id));
      }

      // Existing chapter count drives the position offset when merging so
      // imported chapters land AFTER the user's current ones.
      const existing = await ctx.db.query.chapter.findMany({
        where: eq(chapter.userId, ctx.user.id),
        columns: { position: true },
      });
      const positionOffset =
        existing.length === 0
          ? 0
          : Math.max(...existing.map((e) => e.position)) + 1;

      const report = {
        chaptersCreated: 0,
        nodesCreated: 0,
        skipped: [] as Array<{
          chapter: string;
          kind: string;
          ref: string;
          reason: string;
        }>,
      };

      for (let cIdx = 0; cIdx < input.json.chapters.length; cIdx++) {
        const ch = input.json.chapters[cIdx];
        const [created] = await ctx.db
          .insert(chapter)
          .values({
            userId: ctx.user.id,
            title: ch.title,
            color: ch.color ?? null,
            notes: ch.notes ?? null,
            position: positionOffset + cIdx,
          })
          .returning();
        report.chaptersCreated += 1;

        // Place nodes — keep tier as given, position from index within tier.
        const tierCounters = new Map<number, number>();
        for (const n of ch.nodes) {
          const resolvedId = resolveRef(n.kind, n.refId, n.refKey, n.refTitle);
          if (!resolvedId) {
            report.skipped.push({
              chapter: ch.title,
              kind: n.kind,
              ref: n.refTitle ?? n.refKey ?? n.refId ?? "(none)",
              reason: "no matching entity",
            });
            continue;
          }
          const pos = tierCounters.get(n.tier) ?? 0;
          tierCounters.set(n.tier, pos + 1);
          await ctx.db.insert(boardNode).values({
            userId: ctx.user.id,
            chapterId: created.id,
            kind: n.kind,
            refId: resolvedId,
            tier: n.tier,
            position: pos,
            notes: n.notes ?? null,
          });
          report.nodesCreated += 1;
        }
      }

      return report;
    }),

  // ─────────────────────────────────────────────────────────────────
  // AI plan — generate a starter board from the user's existing backlog.
  // Two-phase: first call may return questions; pass answers on the second
  // call to receive a concrete plan. commitPlan writes the plan to the DB.

  aiPlan: protectedProcedure
    .input(
      z
        .object({
          answers: z
            .array(
              z.object({
                questionId: z.string(),
                question: z.string(),
                answer: z.string().max(500),
              }),
            )
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return runForSurface(ctx.user.id, "board", () =>
        planChapterLayout(ctx.user.id, input?.answers),
      );
    }),

  commitPlan: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["replace", "merge"]).default("merge"),
        chapters: z
          .array(
            z.object({
              title: z.string().min(1).max(80),
              color: z
                .string()
                .regex(/^#[0-9a-fA-F]{6}$/)
                .nullable()
                .optional(),
              notes: z.string().max(500).nullable().optional(),
              nodes: z.array(
                z.object({
                  kind: z.enum(["epic", "milestone", "quest"]),
                  refId: z.string().uuid(),
                  tier: z.number().int().min(0).max(50),
                }),
              ),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate every referenced entity belongs to this user.
      const epicIds = new Set<string>();
      const milestoneIds = new Set<string>();
      const questIds = new Set<string>();
      for (const ch of input.chapters) {
        for (const n of ch.nodes) {
          if (n.kind === "epic") epicIds.add(n.refId);
          else if (n.kind === "milestone") milestoneIds.add(n.refId);
          else if (n.kind === "quest") questIds.add(n.refId);
        }
      }
      const [okEpics, okMilestones, okQuests] = await Promise.all([
        epicIds.size > 0
          ? ctx.db.query.epic.findMany({
              where: and(
                eq(epic.userId, ctx.user.id),
                inArray(epic.id, [...epicIds]),
              ),
              columns: { id: true },
            })
          : Promise.resolve([]),
        milestoneIds.size > 0
          ? ctx.db.query.milestone.findMany({
              where: inArray(milestone.id, [...milestoneIds]),
              with: { epic: { columns: { userId: true } } },
              columns: { id: true },
            })
          : Promise.resolve([]),
        questIds.size > 0
          ? ctx.db.query.quest.findMany({
              where: and(
                eq(quest.userId, ctx.user.id),
                inArray(quest.id, [...questIds]),
              ),
              columns: { id: true },
            })
          : Promise.resolve([]),
      ]);
      const validEpics = new Set(okEpics.map((e) => e.id));
      const validMilestones = new Set(
        okMilestones
          .filter((m) => m.epic.userId === ctx.user.id)
          .map((m) => m.id),
      );
      const validQuests = new Set(okQuests.map((q) => q.id));

      if (input.mode === "replace") {
        await ctx.db.delete(chapter).where(eq(chapter.userId, ctx.user.id));
      }

      const existing = await ctx.db.query.chapter.findMany({
        where: eq(chapter.userId, ctx.user.id),
        columns: { position: true },
      });
      const positionOffset =
        existing.length === 0
          ? 0
          : Math.max(...existing.map((e) => e.position)) + 1;

      const report = {
        chaptersCreated: 0,
        nodesCreated: 0,
        skipped: 0,
      };

      for (let cIdx = 0; cIdx < input.chapters.length; cIdx++) {
        const ch = input.chapters[cIdx];
        const [created] = await ctx.db
          .insert(chapter)
          .values({
            userId: ctx.user.id,
            title: ch.title,
            color: ch.color ?? null,
            notes: ch.notes ?? null,
            position: positionOffset + cIdx,
          })
          .returning();
        report.chaptersCreated += 1;

        const tierCounters = new Map<number, number>();
        for (const n of ch.nodes) {
          const ok =
            n.kind === "epic"
              ? validEpics.has(n.refId)
              : n.kind === "milestone"
                ? validMilestones.has(n.refId)
                : validQuests.has(n.refId);
          if (!ok) {
            report.skipped += 1;
            continue;
          }
          const pos = tierCounters.get(n.tier) ?? 0;
          tierCounters.set(n.tier, pos + 1);
          await ctx.db.insert(boardNode).values({
            userId: ctx.user.id,
            chapterId: created.id,
            kind: n.kind,
            refId: n.refId,
            tier: n.tier,
            position: pos,
          });
          report.nodesCreated += 1;
        }
      }
      return report;
    }),
});

async function assertOwnsChapter(
  ctx: { db: typeof import("@/server/db").db; user: { id: string } },
  chapterId: string,
) {
  const c = await ctx.db.query.chapter.findFirst({
    where: and(
      eq(chapter.id, chapterId),
      eq(chapter.userId, ctx.user.id),
    ),
    columns: { id: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
}
