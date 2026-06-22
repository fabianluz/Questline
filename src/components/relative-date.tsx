import { cn } from "@/lib/utils";
import {
  relativeDateLabel,
  relativeTone,
  type RelativeTone,
} from "@/lib/relative-date";

const TONE: Record<RelativeTone, string> = {
  overdue: "border-trails-bad/50 text-trails-bad",
  today: "border-jrpg-gold/50 text-jrpg-gold",
  soon: "border-trails-info/50 text-trails-info",
  later: "border-trails-trim/50 text-trails-fg-dim",
};

/**
 * Tiny pill showing a date relative to today ("in 3d" / "overdue 2d"),
 * color-coded by urgency. Hover shows the absolute date. Renders nothing
 * when no date is given, so it's safe to drop in anywhere.
 */
export function RelativeDate({
  date,
  prefix,
  className,
}: {
  date: string | null | undefined;
  prefix?: string;
  className?: string;
}) {
  if (!date) return null;
  const tone = relativeTone(date);
  return (
    <span
      title={date}
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        TONE[tone],
        className,
      )}
    >
      {prefix}
      {relativeDateLabel(date)}
    </span>
  );
}
