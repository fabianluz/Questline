// Client-safe money helpers — no server-only imports.

/** Format integer cents as a localized currency string. */
export function formatCents(
  cents: number,
  currency: string = "EUR",
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...opts,
  }).format(cents / 100);
}

/** Parse a user-typed decimal string (e.g. "1234.56") into integer cents. */
export function parseToCents(input: string): number {
  // Accept either dot or comma decimal; strip everything else.
  const cleaned = input.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}
