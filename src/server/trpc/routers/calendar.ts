import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { calendarFeed } from "@/server/db/schema";

function newToken(): string {
  // 24 random bytes → 32 URL-safe base64 chars. Long enough that brute-force
  // guessing is hopeless even without rate limiting.
  return randomBytes(24).toString("base64url");
}

export const calendarRouter = router({
  /**
   * Returns the user's feed token, creating one on first call.
   * The client combines this with window.location to build the subscription URL.
   */
  getFeed: protectedProcedure.query(async ({ ctx }) => {
    let existing = await ctx.db.query.calendarFeed.findFirst({
      where: eq(calendarFeed.userId, ctx.user.id),
    });
    if (!existing) {
      const [created] = await ctx.db
        .insert(calendarFeed)
        .values({ userId: ctx.user.id, token: newToken() })
        .returning();
      existing = created;
    }
    return {
      token: existing.token,
      createdAt: existing.createdAt,
      rotatedAt: existing.rotatedAt,
    };
  }),

  /**
   * Rotates the token, invalidating any clients still subscribed to the
   * previous URL. Use after sharing the URL by accident, or annually as
   * routine hygiene.
   */
  regenerateToken: protectedProcedure.mutation(async ({ ctx }) => {
    const [updated] = await ctx.db
      .update(calendarFeed)
      .set({ token: newToken(), rotatedAt: new Date() })
      .where(eq(calendarFeed.userId, ctx.user.id))
      .returning();
    if (updated) return { token: updated.token };

    // Race: no row yet (user never called getFeed). Create with a fresh token.
    const [created] = await ctx.db
      .insert(calendarFeed)
      .values({ userId: ctx.user.id, token: newToken() })
      .returning();
    return { token: created.token };
  }),
});
