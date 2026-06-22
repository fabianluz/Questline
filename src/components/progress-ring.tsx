import { cn } from "@/lib/utils";

/**
 * Tiny circular progress indicator. `value` is 0..1. The track uses the muted
 * trim color; the arc uses `trails-good`. Purely presentational + inline-SVG,
 * so it works anywhere (lists, rows, cards).
 */
export function ProgressRing({
  value,
  size = 16,
  stroke = 2.5,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-trails-trim/40"
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        className={pct >= 1 ? "text-trails-good" : "text-trails-accent"}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
