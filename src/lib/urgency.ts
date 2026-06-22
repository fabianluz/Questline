/**
 * §6 — Status Effects for Deadlines.
 *
 * Pure date math turning "milestone has a deadline" into a UI status the tree
 * node can render. Mirrors the brief metaphors:
 *   - "normal"    : far away, no decoration
 *   - "imminent"  : ≤7 days, soft glow
 *   - "burning"   : ≤2 days OR overdue with sub-steps incomplete, pulse
 *   - "fractured" : missed deadline + still incomplete, broken-frame styling
 *   - "victory"   : completed (always green halo, even if late)
 */

export type UrgencyState =
  | "normal"
  | "imminent"
  | "burning"
  | "fractured"
  | "victory";

const MS_DAY = 24 * 60 * 60 * 1000;

export function computeUrgency(input: {
  estimatedAchievementDate: string | null;
  status: string;
  now?: Date;
}): UrgencyState {
  if (input.status === "completed") return "victory";
  if (!input.estimatedAchievementDate) return "normal";

  const now = input.now ?? new Date();
  const [y, m, d] = input.estimatedAchievementDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysOut = Math.round((target.getTime() - todayUtc.getTime()) / MS_DAY);

  if (daysOut < 0) return "fractured";
  if (daysOut <= 2) return "burning";
  if (daysOut <= 7) return "imminent";
  return "normal";
}

export const URGENCY_PRIORITY: Record<UrgencyState, number> = {
  victory: 4,
  fractured: 3,
  burning: 2,
  imminent: 1,
  normal: 0,
};

/** For sorting "most urgent first" in lists. */
export function urgencyRank(a: UrgencyState, b: UrgencyState): number {
  return URGENCY_PRIORITY[b] - URGENCY_PRIORITY[a];
}
