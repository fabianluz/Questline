import { z } from "zod";
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { category, epic } from "@/server/db/schema";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const categoryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const cats = await ctx.db
      .select()
      .from(category)
      .where(eq(category.userId, ctx.user.id))
      .orderBy(asc(category.name));

    if (cats.length === 0) return [];

    const counts = await ctx.db
      .select({
        categoryId: epic.categoryId,
        n: count(),
      })
      .from(epic)
      .where(
        and(
          eq(epic.userId, ctx.user.id),
          isNotNull(epic.categoryId),
          inArray(
            epic.categoryId,
            cats.map((c) => c.id),
          ),
        ),
      )
      .groupBy(epic.categoryId);

    const countMap = new Map(counts.map((c) => [c.categoryId, c.n]));

    return cats.map((c) => ({
      ...c,
      epicCount: countMap.get(c.id) ?? 0,
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: z.string().regex(HEX_COLOR),
        icon: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [created] = await ctx.db
          .insert(category)
          .values({
            userId: ctx.user.id,
            name: input.name.trim(),
            color: input.color,
            icon: input.icon,
          })
          .returning();
        return created;
      } catch (err) {
        if (err instanceof Error && err.message.includes("category_user_name_idx")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A category named "${input.name}" already exists.`,
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
        color: z.string().regex(HEX_COLOR).optional(),
        icon: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [updated] = await ctx.db
        .update(category)
        .set(rest)
        .where(and(eq(category.id, id), eq(category.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(category)
        .where(
          and(eq(category.id, input.id), eq(category.userId, ctx.user.id)),
        );
      return { success: true };
    }),
});
