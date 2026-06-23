/**
 * Pre-run hardware estimates for local models (ported from Arcadia's hwperf).
 *
 * Autoregressive decoding is memory-bandwidth-bound — each token streams ~all
 * the weights from memory once — so tokens/sec ≈ (memory bandwidth) / (model
 * size in memory) × a real-world efficiency factor. This lets the Model Manager
 * show an *estimated* speed BEFORE you run a model (Questline's other tok/s is
 * measured only after a generation). Scoped to Apple Silicon (Questline ships a
 * Mac .dmg); unknown chips return null and callers simply omit the estimate.
 *
 * Pure + dependency-free so it runs in the client (Model Manager) and is unit
 * tested. Also carries the quantization-quality helpers used for low-quant
 * warnings.
 */

/** Apple Silicon unified-memory bandwidth (GB/s), by chip family. */
const APPLE_BANDWIDTH: Record<string, number> = {
  "m1 ultra": 800, "m1 max": 400, "m1 pro": 200, m1: 68,
  "m2 ultra": 800, "m2 max": 400, "m2 pro": 200, m2: 100,
  "m3 ultra": 800, "m3 max": 400, "m3 pro": 150, m3: 100,
  "m4 max": 410, "m4 pro": 273, m4: 120,
  "m5 max": 410, "m5 pro": 307, m5: 153,
};

// Longest keys first so "m4 pro" matches before "m4".
const BW_KEYS = Object.keys(APPLE_BANDWIDTH).sort((a, b) => b.length - a.length);

// Apple Silicon LLM decode realistically reaches ~half of peak bandwidth; keep
// the estimate conservative so it never over-promises.
const EFFICIENCY = 0.55;

/** Memory bandwidth (GB/s) for a chip brand string ("Apple M4 Pro"), or null. */
export function chipBandwidth(chip: string | null | undefined): number | null {
  if (!chip) return null;
  const c = chip.toLowerCase();
  for (const k of BW_KEYS) if (c.includes(k)) return APPLE_BANDWIDTH[k];
  return null;
}

/** Estimated decode tokens/sec for a model of `sizeBytes` on `chip`, or null. */
export function estimateTokensPerSec(
  sizeBytes: number | null | undefined,
  chip: string | null | undefined,
): number | null {
  const bw = chipBandwidth(chip);
  if (!bw || !sizeBytes || sizeBytes <= 0) return null;
  const sizeGB = sizeBytes / 1_000_000_000;
  return (bw / sizeGB) * EFFICIENCY;
}

export type SpeedTier = "fast" | "ok" | "slow";

/** A short label + tier for a tokens/sec estimate (null → no estimate). */
export function speedLabel(
  tps: number | null,
): { text: string; tier: SpeedTier } | null {
  if (tps === null) return null;
  const text = `≈${tps >= 100 ? Math.round(tps) : tps.toFixed(tps < 10 ? 1 : 0)} tok/s`;
  const tier: SpeedTier = tps >= 25 ? "fast" : tps >= 8 ? "ok" : "slow";
  return { text, tier };
}

/**
 * Bit-width parsed from a quantization label ("Q4_K_M"→4, "q3_K_S"→3,
 * "F16"→16). null if the label is missing or unrecognized.
 */
export function quantBits(quant: string | null | undefined): number | null {
  if (!quant) return null;
  const m = quant.match(/q(\d+)/i);
  if (m) return Number(m[1]);
  if (/f16|bf16|fp16/i.test(quant)) return 16;
  if (/f32|fp32/i.test(quant)) return 32;
  return null;
}

/** True for a low-quant build (≤Q3), where JSON/output reliability degrades. */
export function isLowQuant(quant: string | null | undefined): boolean {
  const bits = quantBits(quant);
  return bits !== null && bits <= 3;
}

/** A coarse quality hint from a quantization label (e.g. "Q4_K_M"). */
export function quantQuality(quant: string | null | undefined): string | null {
  const bits = quantBits(quant);
  if (bits === null) return null;
  if (bits <= 3) return "lower quality";
  if (bits <= 4) return "good quality";
  if (bits <= 6) return "high quality";
  return "max quality";
}
