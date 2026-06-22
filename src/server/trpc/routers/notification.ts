import { z } from "zod";
import { and, eq, gte, lte, inArray, isNotNull, ne } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import {
  notificationPreference,
  notificationLog,
  quest,
  questCompletion,
  milestone,
  epic,
  recurringBill,
  scheduleProfile,
  calendarBlock,
  userPreference,
} from "@/server/db/schema";
import { periodFor } from "@/lib/quest-periods";
import { inQuietHours, localMinutesOfDay, nowPastHHMM } from "@/lib/notify-time";
import { resolveWindow } from "@/lib/schedule";

const KIND = z.enum([
  "quest_due",
  "milestone_upcoming",
  "milestone_starting",
  "bill_upcoming",
  "daily_digest",
]);
type NotificationKind = z.infer<typeof KIND>;

// The digest is a single notification with no originating entity, so we use a
// fixed sentinel UUID as its refId for the dedupe ledger.
const DIGEST_REF = "00000000-0000-0000-0000-000000000000";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(...(fromISO.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(toISO.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

const prefsInput = z.object({
  enabled: z.boolean().optional(),
  questReminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .optional(),
  milestoneReminderDays: z.number().int().min(0).max(60).optional(),
  billReminderDays: z.number().int().min(0).max(60).optional(),
  dailyDigest: z.boolean().optional(),
  digestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .optional(),
  quietEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
    .optional(),
});

export const notificationRouter = router({
  /** Get-or-create preferences row. Defaults: disabled. */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.query.notificationPreference.findFirst({
      where: eq(notificationPreference.userId, ctx.user.id),
    });
    if (existing) return existing;
    const [created] = await ctx.db
      .insert(notificationPreference)
      .values({ userId: ctx.user.id })
      .returning();
    return created;
  }),

  updatePreferences: protectedProcedure
    .input(prefsInput)
    .mutation(async ({ ctx, input }) => {
      // Ensure row exists, then update.
      await ctx.db
        .insert(notificationPreference)
        .values({ userId: ctx.user.id })
        .onConflictDoNothing();
      const [updated] = await ctx.db
        .update(notificationPreference)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(notificationPreference.userId, ctx.user.id))
        .returning();
      return updated;
    }),

  /**
   * Compute the list of notifications the client should fire right now.
   * Each entry already passed dedupe (no row in notification_log for today).
   * The client renders them, then calls markFired so they don't fire again.
   */
  getPending: protectedProcedure
    .input(
      z
        .object({
          // Client's Date.getTimezoneOffset() so all time gating is in the
          // user's local time, not the server's UTC.
          tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
    const prefs = await ctx.db.query.notificationPreference.findFirst({
      where: eq(notificationPreference.userId, ctx.user.id),
    });
    if (!prefs || !prefs.enabled) return [];

    const localMinutes = localMinutesOfDay(input?.tzOffsetMinutes ?? 0);

    // Respect quiet hours — suppress everything (including the digest) while
    // inside the window.
    if (
      prefs.quietHoursEnabled &&
      inQuietHours(prefs.quietStart, prefs.quietEnd, localMinutes)
    )
      return [];

    const today = todayISO();
    const firedToday = await ctx.db.query.notificationLog.findMany({
      where: and(
        eq(notificationLog.userId, ctx.user.id),
        eq(notificationLog.firedFor, today),
      ),
      columns: { kind: true, refId: true },
    });
    const isFired = (kind: NotificationKind, refId: string) =>
      firedToday.some((row) => row.kind === kind && row.refId === refId);

    const out: Array<{
      kind: NotificationKind;
      refId: string;
      title: string;
      body: string;
      tag: string;
    }> = [];

    // --- Quest reminders ---
    if (nowPastHHMM(prefs.questReminderTime, localMinutes)) {
      const allQuests = await ctx.db.query.quest.findMany({
        where: and(
          eq(quest.userId, ctx.user.id),
          eq(quest.archived, false),
          eq(quest.cadence, "daily"),
        ),
        columns: { id: true, title: true, startDate: true, endDate: true },
      });
      // Planning v2: don't nag for quests outside their active window.
      const quests = allQuests.filter(
        (q) =>
          (!q.startDate || q.startDate <= today) &&
          (!q.endDate || q.endDate >= today),
      );
      if (quests.length > 0) {
        const period = periodFor("daily");
        const completions = await ctx.db.query.questCompletion.findMany({
          where: and(
            inArray(
              questCompletion.questId,
              quests.map((q) => q.id),
            ),
            eq(questCompletion.completedFor, period),
          ),
          columns: { questId: true },
        });
        const completedIds = new Set(completions.map((c) => c.questId));
        for (const q of quests) {
          if (completedIds.has(q.id)) continue;
          if (isFired("quest_due", q.id)) continue;
          out.push({
            kind: "quest_due",
            refId: q.id,
            title: "Quest still pending",
            body: q.title,
            tag: `quest-${q.id}`,
          });
        }
      }
    }

    // --- Milestone deadlines ---
    if (prefs.milestoneReminderDays > 0) {
      const horizon = addDaysISO(today, prefs.milestoneReminderDays);
      const upcoming = await ctx.db
        .select({
          id: milestone.id,
          title: milestone.title,
          date: milestone.estimatedAchievementDate,
          epicTitle: epic.title,
        })
        .from(milestone)
        .innerJoin(epic, eq(milestone.epicId, epic.id))
        .where(
          and(
            eq(epic.userId, ctx.user.id),
            ne(milestone.status, "completed"),
            isNotNull(milestone.estimatedAchievementDate),
            gte(milestone.estimatedAchievementDate, today),
            lte(milestone.estimatedAchievementDate, horizon),
          ),
        );
      for (const m of upcoming) {
        if (!m.date) continue;
        if (isFired("milestone_upcoming", m.id)) continue;
        const days = daysBetween(today, m.date);
        const when =
          days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        out.push({
          kind: "milestone_upcoming",
          refId: m.id,
          title: `Milestone ${when}`,
          body: `${m.title} — ${m.epicTitle}`,
          tag: `milestone-${m.id}`,
        });
      }

      // Milestones whose planned START is within the same lead window and that
      // haven't been started yet — a nudge to begin the work.
      const starting = await ctx.db
        .select({
          id: milestone.id,
          title: milestone.title,
          date: milestone.estimatedStartDate,
          epicTitle: epic.title,
        })
        .from(milestone)
        .innerJoin(epic, eq(milestone.epicId, epic.id))
        .where(
          and(
            eq(epic.userId, ctx.user.id),
            eq(milestone.status, "not_started"),
            isNotNull(milestone.estimatedStartDate),
            gte(milestone.estimatedStartDate, today),
            lte(milestone.estimatedStartDate, horizon),
          ),
        );
      for (const m of starting) {
        if (!m.date) continue;
        if (isFired("milestone_starting", m.id)) continue;
        const days = daysBetween(today, m.date);
        const when =
          days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        out.push({
          kind: "milestone_starting",
          refId: m.id,
          title: `Milestone starts ${when}`,
          body: `${m.title} — ${m.epicTitle}`,
          tag: `milestone-start-${m.id}`,
        });
      }
    }

    // --- Bill reminders ---
    if (prefs.billReminderDays > 0) {
      const horizon = addDaysISO(today, prefs.billReminderDays);
      const upcoming = await ctx.db.query.recurringBill.findMany({
        where: and(
          eq(recurringBill.userId, ctx.user.id),
          eq(recurringBill.archived, false),
          isNotNull(recurringBill.nextDueDate),
          gte(recurringBill.nextDueDate, today),
          lte(recurringBill.nextDueDate, horizon),
        ),
        columns: {
          id: true,
          name: true,
          amountCents: true,
          currency: true,
          nextDueDate: true,
        },
      });
      for (const b of upcoming) {
        if (!b.nextDueDate) continue;
        if (isFired("bill_upcoming", b.id)) continue;
        const days = daysBetween(today, b.nextDueDate);
        const when =
          days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        const amount = (b.amountCents / 100).toLocaleString(undefined, {
          style: "currency",
          currency: b.currency,
        });
        out.push({
          kind: "bill_upcoming",
          refId: b.id,
          title: `Bill due ${when}`,
          body: `${b.name} — ${amount}`,
          tag: `bill-${b.id}`,
        });
      }
    }

    // --- Daily digest mode ---
    // When enabled we suppress the individual notifications above and emit ONE
    // summary at `digestTime` (deduped for the day on its own sentinel key).
    if (prefs.dailyDigest) {
      if (!nowPastHHMM(prefs.digestTime, localMinutes)) return [];
      if (isFired("daily_digest", DIGEST_REF)) return [];

      // We didn't gate the quest section on time for digest mode, so re-filter:
      // count whatever pending items we collected today.
      const quests = out.filter((o) => o.kind === "quest_due").length;
      const milestones = out.filter(
        (o) => o.kind === "milestone_upcoming" || o.kind === "milestone_starting",
      ).length;
      const bills = out.filter((o) => o.kind === "bill_upcoming").length;
      if (quests + milestones + bills === 0) return [];

      const parts: string[] = [];
      if (quests) parts.push(`${quests} quest${quests === 1 ? "" : "s"} pending`);
      if (milestones)
        parts.push(`${milestones} milestone${milestones === 1 ? "" : "s"} soon`);
      if (bills) parts.push(`${bills} bill${bills === 1 ? "" : "s"} due`);

      // Schedule-aware: lead the digest with today's work window / day-off.
      const [sp, cb, up] = await Promise.all([
        ctx.db.query.scheduleProfile.findMany({
          where: eq(scheduleProfile.userId, ctx.user.id),
        }),
        ctx.db.query.calendarBlock.findMany({
          where: eq(calendarBlock.userId, ctx.user.id),
        }),
        ctx.db.query.userPreference.findFirst({
          where: eq(userPreference.userId, ctx.user.id),
          columns: { workWindowStart: true, workWindowEnd: true, workWindowDays: true },
        }),
      ]);
      if (sp.length > 0 || cb.length > 0) {
        const win = resolveWindow(today, {
          profiles: sp.map((p) => ({
            name: p.name,
            startTime: p.startTime,
            endTime: p.endTime,
            days: p.days,
            effectiveFrom: p.effectiveFrom,
            effectiveTo: p.effectiveTo,
            priority: p.priority,
            active: p.active,
          })),
          blocks: cb.map((b) => ({
            title: b.title,
            startDate: b.startDate,
            endDate: b.endDate,
            blocksWork: b.blocksWork,
          })),
          fallback: up
            ? { startTime: up.workWindowStart, endTime: up.workWindowEnd, days: up.workWindowDays }
            : null,
        });
        parts.unshift(
          win.working
            ? `🗓️ ${win.start}–${win.end}`
            : `🌴 day off${win.label ? ` (${win.label})` : ""}`,
        );
      }

      return [
        {
          kind: "daily_digest" as const,
          refId: DIGEST_REF,
          title: "Today's briefing",
          body: parts.join(" · "),
          tag: `digest-${today}`,
        },
      ];
    }

    return out;
  }),

  markFired: protectedProcedure
    .input(z.object({ kind: KIND, refId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(notificationLog)
        .values({
          userId: ctx.user.id,
          kind: input.kind,
          refId: input.refId,
          firedFor: todayISO(),
        })
        .onConflictDoNothing();
      return { success: true };
    }),
});
