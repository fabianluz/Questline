import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  epic,
  financialAccount,
  financialGoal,
  recurringBill,
} from "@/server/db/schema";

// --- Shared schemas ---------------------------------------------------------

const kindSchema = z.enum(["asset", "liability"]);
const cadenceSchema = z.enum(["weekly", "monthly", "yearly"]);
const goalStatusSchema = z.enum(["active", "achieved", "abandoned"]);
const currencySchema = z.string().min(3).max(8);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Cents are integers; we accept any non-negative integer up to ~21M dollars.
const centsSchema = z.number().int().min(0).max(2_147_483_647);

// --- Helpers ----------------------------------------------------------------

type Ctx = { db: typeof import("@/server/db").db; user: { id: string } };

async function assertOwns<T extends { userId: string }>(
  row: T | undefined,
  userId: string,
) {
  if (!row || row.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return row;
}

/**
 * Recurring bills can be paid weekly / monthly / yearly; we normalize each
 * bill into a "per month" cost so we can sum apples-to-apples for the
 * monthly outflow stat.
 */
function monthlyEquivalentCents(amountCents: number, cadence: string): number {
  if (cadence === "weekly") return Math.round((amountCents * 52) / 12);
  if (cadence === "yearly") return Math.round(amountCents / 12);
  return amountCents; // monthly
}

// --- Accounts sub-router ----------------------------------------------------

const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.userId, ctx.user.id),
          eq(financialAccount.archived, false),
        ),
      )
      .orderBy(asc(financialAccount.kind), asc(financialAccount.name));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        kind: kindSchema,
        category: z.string().min(1).max(50).default("other"),
        balanceCents: centsSchema,
        currency: currencySchema.default("EUR"),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(financialAccount)
        .values({ userId: ctx.user.id, ...input })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        kind: kindSchema.optional(),
        category: z.string().min(1).max(50).optional(),
        balanceCents: centsSchema.optional(),
        currency: currencySchema.optional(),
        notes: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.financialAccount.findFirst({
        where: eq(financialAccount.id, id),
      });
      await assertOwns(existing, ctx.user.id);
      const [updated] = await ctx.db
        .update(financialAccount)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(financialAccount.id, id))
        .returning();
      return updated;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.financialAccount.findFirst({
        where: eq(financialAccount.id, input.id),
      });
      await assertOwns(existing, ctx.user.id);
      await ctx.db
        .update(financialAccount)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(financialAccount.id, input.id));
      return { success: true };
    }),
});

// --- Bills sub-router -------------------------------------------------------

const billsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(recurringBill)
      .where(
        and(
          eq(recurringBill.userId, ctx.user.id),
          eq(recurringBill.archived, false),
        ),
      )
      .orderBy(asc(recurringBill.cadence), asc(recurringBill.name));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        amountCents: centsSchema,
        currency: currencySchema.default("EUR"),
        cadence: cadenceSchema.default("monthly"),
        category: z.string().min(1).max(50).default("other"),
        nextDueDate: isoDateSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(recurringBill)
        .values({ userId: ctx.user.id, ...input })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        amountCents: centsSchema.optional(),
        currency: currencySchema.optional(),
        cadence: cadenceSchema.optional(),
        category: z.string().min(1).max(50).optional(),
        nextDueDate: isoDateSchema.nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.recurringBill.findFirst({
        where: eq(recurringBill.id, id),
      });
      await assertOwns(existing, ctx.user.id);
      const [updated] = await ctx.db
        .update(recurringBill)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(recurringBill.id, id))
        .returning();
      return updated;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.recurringBill.findFirst({
        where: eq(recurringBill.id, input.id),
      });
      await assertOwns(existing, ctx.user.id);
      await ctx.db
        .update(recurringBill)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(recurringBill.id, input.id));
      return { success: true };
    }),
});

// --- Goals sub-router -------------------------------------------------------

const goalsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.financialGoal.findMany({
      where: eq(financialGoal.userId, ctx.user.id),
      with: {
        epic: { columns: { id: true, title: true } },
      },
      orderBy: [
        asc(financialGoal.status),
        desc(financialGoal.createdAt),
      ],
    });
    return rows.map((g) => ({
      ...g,
      progress:
        g.targetCents > 0
          ? Math.min(1, g.currentCents / g.targetCents)
          : 0,
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        targetCents: centsSchema,
        currentCents: centsSchema.default(0),
        currency: currencySchema.default("EUR"),
        targetDate: isoDateSchema.optional(),
        epicId: z.string().uuid().nullish(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.epicId) await assertOwnsEpic(ctx, input.epicId);
      const [created] = await ctx.db
        .insert(financialGoal)
        .values({ userId: ctx.user.id, ...input })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        targetCents: centsSchema.optional(),
        currentCents: centsSchema.optional(),
        currency: currencySchema.optional(),
        targetDate: isoDateSchema.nullish(),
        epicId: z.string().uuid().nullish(),
        status: goalStatusSchema.optional(),
        notes: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const existing = await ctx.db.query.financialGoal.findFirst({
        where: eq(financialGoal.id, id),
      });
      await assertOwns(existing, ctx.user.id);
      if (rest.epicId) await assertOwnsEpic(ctx, rest.epicId);
      const [updated] = await ctx.db
        .update(financialGoal)
        .set({ ...rest, updatedAt: new Date() })
        .where(eq(financialGoal.id, id))
        .returning();
      return updated;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.financialGoal.findFirst({
        where: eq(financialGoal.id, input.id),
      });
      await assertOwns(existing, ctx.user.id);
      await ctx.db
        .update(financialGoal)
        .set({ status: "abandoned", updatedAt: new Date() })
        .where(eq(financialGoal.id, input.id));
      return { success: true };
    }),
});

async function assertOwnsEpic(ctx: Ctx, epicId: string) {
  const e = await ctx.db.query.epic.findFirst({
    where: and(eq(epic.id, epicId), eq(epic.userId, ctx.user.id)),
    columns: { id: true },
  });
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Epic not found" });
}

// --- Summary ----------------------------------------------------------------

export const inventoryRouter = router({
  accounts: accountsRouter,
  bills: billsRouter,
  goals: goalsRouter,

  summary: protectedProcedure.query(async ({ ctx }) => {
    // One trip per concept — explicit and readable. None of these blow up by
    // currency yet because we treat currency as a label, not an FX domain.
    const [assets] = await ctx.db
      .select({
        total: sql<number>`COALESCE(SUM(${financialAccount.balanceCents}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.userId, ctx.user.id),
          eq(financialAccount.kind, "asset"),
          eq(financialAccount.archived, false),
        ),
      );

    const [liabilities] = await ctx.db
      .select({
        total: sql<number>`COALESCE(SUM(${financialAccount.balanceCents}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.userId, ctx.user.id),
          eq(financialAccount.kind, "liability"),
          eq(financialAccount.archived, false),
        ),
      );

    const bills = await ctx.db
      .select({
        amountCents: recurringBill.amountCents,
        cadence: recurringBill.cadence,
      })
      .from(recurringBill)
      .where(
        and(
          eq(recurringBill.userId, ctx.user.id),
          eq(recurringBill.archived, false),
        ),
      );

    const monthlyOutflowCents = bills.reduce(
      (sum, b) => sum + monthlyEquivalentCents(b.amountCents, b.cadence),
      0,
    );

    return {
      assetsCents: assets.total,
      liabilitiesCents: liabilities.total,
      netWorthCents: assets.total - liabilities.total,
      accountCount: assets.count + liabilities.count,
      monthlyOutflowCents,
      billCount: bills.length,
    };
  }),
});
