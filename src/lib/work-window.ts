/**
 * §5 — Calendar time-blocking helper.
 *
 * Given a user's work window (e.g. weekdays 9–17, 45-min default block) and a
 * list of incomplete Steps, allocate each Step into the next available
 * weekday slot. Output is a list of {step, startsAt, endsAt} suitable for
 * .ics VEVENT emission.
 */

export type WorkWindow = {
  startHHMM: string; // "09:00"
  endHHMM: string; // "17:00"
  daysMask: string; // 7 chars, Mon-Sun, "1"=on
  defaultDurationMin: number;
};

export type StepToBlock = {
  id: string;
  title: string;
  milestoneTitle: string;
  estimatedMinutes?: number;
};

export type StepBlock = {
  stepId: string;
  title: string;
  milestoneTitle: string;
  startsAt: Date;
  endsAt: Date;
};

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number);
  return { h, m };
}

function isWorkDay(date: Date, mask: string): boolean {
  // JS getUTCDay: 0=Sun..6=Sat. Mask is Mon-Sun.
  const jsDay = date.getUTCDay();
  const maskIdx = jsDay === 0 ? 6 : jsDay - 1;
  return mask.charAt(maskIdx) === "1";
}

/**
 * Allocate steps starting from `from`. Walks day by day, fitting back-to-back
 * blocks into the work window. Skips weekends/off-days. Caps at `maxDays` to
 * avoid runaway loops.
 */
export function scheduleSteps(
  window: WorkWindow,
  steps: StepToBlock[],
  from: Date = new Date(),
  maxDays = 90,
): StepBlock[] {
  if (steps.length === 0) return [];
  const out: StepBlock[] = [];
  const { h: startH, m: startM } = parseHHMM(window.startHHMM);
  const { h: endH, m: endM } = parseHHMM(window.endHHMM);

  const cursor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      startH,
      startM,
    ),
  );
  // If we're already past the window start today, push to next day to avoid
  // scheduling something in the past.
  const now = from;
  if (
    cursor.getUTCFullYear() === now.getUTCFullYear() &&
    cursor.getUTCMonth() === now.getUTCMonth() &&
    cursor.getUTCDate() === now.getUTCDate() &&
    (now.getUTCHours() > startH ||
      (now.getUTCHours() === startH && now.getUTCMinutes() > startM))
  ) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(startH, startM, 0, 0);
  }

  let stepIdx = 0;
  let daysWalked = 0;

  while (stepIdx < steps.length && daysWalked < maxDays) {
    if (!isWorkDay(cursor, window.daysMask)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(startH, startM, 0, 0);
      daysWalked += 1;
      continue;
    }

    const step = steps[stepIdx];
    const duration = step.estimatedMinutes ?? window.defaultDurationMin;
    const blockEnd = new Date(cursor.getTime() + duration * 60 * 1000);
    const dayEnd = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        endH,
        endM,
      ),
    );

    if (blockEnd.getTime() > dayEnd.getTime()) {
      // Doesn't fit today — roll to the next day.
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(startH, startM, 0, 0);
      daysWalked += 1;
      continue;
    }

    out.push({
      stepId: step.id,
      title: step.title,
      milestoneTitle: step.milestoneTitle,
      startsAt: new Date(cursor),
      endsAt: blockEnd,
    });

    cursor.setTime(blockEnd.getTime());
    stepIdx += 1;
  }

  return out;
}
