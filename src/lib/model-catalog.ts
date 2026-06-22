/**
 * Curated, RAM-aware catalog for Questline's Model Manager. Merged with engine
 * truth (Ollama /api/tags + /api/show) at runtime; works offline as a static
 * list of suggestions. Refs are exact Ollama pull tags.
 *
 * Adapted from Arcadia's catalog, trimmed to tool-calling-capable local models
 * that suit Questline's AI (epic break-down, chapter planner, Ask the Guide,
 * notes→JSON, skill suggestions). All run via the local Ollama engine.
 */

export type ModelTier = "fast" | "balanced" | "heavy";

export interface ModelCapabilities {
  chat: boolean;
  tools: boolean;
  vision: boolean;
  embedding: boolean;
}

export interface CatalogModel {
  /** Exact Ollama pull ref, e.g. "qwen2.5:14b". */
  ref: string;
  label: string;
  family: string;
  tier: ModelTier;
  /** Parameter count in billions (for the MoE models, the active/total hint). */
  paramsB?: number;
  quant?: string;
  /** Rough on-disk / in-memory size in bytes (Q4 GGUF estimate). */
  approxBytes?: number;
  contextTokens?: number;
  capabilities: ModelCapabilities;
  blurb: string;
  /** Optional caveat shown in the UI (e.g. a tag to double-check). */
  note?: string;
}

const GB = 1024 ** 3;
const tools: ModelCapabilities = { chat: true, tools: true, vision: false, embedding: false };

export const CATALOG: CatalogModel[] = [
  {
    ref: "qwen2.5:3b",
    label: "Qwen2.5 3B",
    family: "qwen2.5",
    tier: "fast",
    paramsB: 3,
    approxBytes: Math.round(1.9 * GB),
    contextTokens: 32768,
    capabilities: tools,
    blurb: "Tiny + instant. Great on low-RAM machines; weakest at strict JSON.",
  },
  {
    ref: "qwen2.5:7b",
    label: "Qwen2.5 7B",
    family: "qwen2.5",
    tier: "fast",
    paramsB: 7,
    approxBytes: Math.round(4.7 * GB),
    contextTokens: 32768,
    capabilities: tools,
    blurb: "Fast all-rounder. Solid tool-calling, light on memory.",
  },
  {
    ref: "qwen2.5:14b",
    label: "Qwen2.5 14B",
    family: "qwen2.5",
    tier: "balanced",
    paramsB: 14,
    approxBytes: Math.round(9 * GB),
    contextTokens: 32768,
    capabilities: tools,
    blurb: "Questline's default — the reliability/speed sweet spot for planning.",
  },
  {
    ref: "qwen2.5-coder:14b",
    label: "Qwen2.5 Coder 14B",
    family: "qwen2.5-coder",
    tier: "balanced",
    paramsB: 14,
    approxBytes: Math.round(9 * GB),
    contextTokens: 32768,
    capabilities: tools,
    blurb: "Coding-tuned 14B. Strongest at structured / JSON output.",
  },
  {
    ref: "qwen3:30b-a3b",
    label: "Qwen3 30B (A3B MoE)",
    family: "qwen3",
    tier: "heavy",
    paramsB: 30,
    approxBytes: Math.round(18 * GB),
    contextTokens: 40960,
    capabilities: tools,
    blurb: "Mixture-of-experts: 30B quality at ~3B active speed. Needs ~18 GB.",
  },
  {
    ref: "qwen3:32b",
    label: "Qwen3 32B",
    family: "qwen3",
    tier: "heavy",
    paramsB: 32,
    approxBytes: Math.round(20 * GB),
    contextTokens: 40960,
    capabilities: tools,
    blurb: "Dense 32B — top reasoning, slowest. Wants 24 GB+ of memory.",
  },
  {
    ref: "qwen3.6:27b",
    label: "Qwen3.6 27B",
    family: "qwen3.6",
    tier: "heavy",
    paramsB: 27,
    approxBytes: Math.round(17 * GB),
    contextTokens: 40960,
    capabilities: tools,
    blurb: "Newest Qwen generation, 27B. Heavy; verify the exact tag is live.",
    note: "Confirm `qwen3.6:27b` exists in the Ollama registry before pulling.",
  },
  {
    ref: "gemma3:12b",
    label: "Gemma 3 12B",
    family: "gemma3",
    tier: "balanced",
    paramsB: 12,
    approxBytes: Math.round(8.1 * GB),
    contextTokens: 131072,
    capabilities: { chat: true, tools: false, vision: false, embedding: false },
    blurb: "Google's 12B with a huge 128k context. No native tool-calling.",
  },
];

export const TIER_ORDER: ModelTier[] = ["fast", "balanced", "heavy"];

/** Ollama treats a bare name as ":latest"; match catalog refs the same way. */
export function normalizeRef(ref: string): string {
  return ref.includes(":") ? ref : `${ref}:latest`;
}

export function catalogByRef(ref: string): CatalogModel | undefined {
  const n = normalizeRef(ref);
  return CATALOG.find((m) => normalizeRef(m.ref) === n);
}

export type FitVerdict = "ok" | "tight" | "over" | "unknown";

/**
 * Will this model load comfortably on a machine with `totalBytes` of memory?
 *   ok    — under half of total (loads with room to spare)
 *   tight — half to three-quarters (loads, but little headroom)
 *   over  — above three-quarters (likely to swap or fail)
 */
export function fitFor(approxBytes: number | undefined, totalBytes: number | undefined): FitVerdict {
  if (!approxBytes || !totalBytes) return "unknown";
  if (approxBytes < totalBytes * 0.5) return "ok";
  if (approxBytes < totalBytes * 0.75) return "tight";
  return "over";
}
