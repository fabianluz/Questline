/**
 * Pure model-routing logic: the set of AI "surfaces" a user can assign models
 * to, Auto-routing (pick a sensible installed model per surface), and the
 * tokens/second computation for the speed badge.
 *
 * Kept free of server/db imports so it's unit-testable and shared by the
 * Model Manager UI. The server wrapper (server/model-routing.ts) feeds it
 * engine truth (installed models + RAM fit) and applies the resolution order.
 */

import type { ModelTier } from "./model-catalog";

/** The AI features a user can pin a model to (or leave on Auto/default). */
export const MODEL_SURFACES = [
  "chat",
  "breakdown",
  "board",
  "skills",
  "coach",
  "import",
  "planning",
] as const;

export type ModelSurface = (typeof MODEL_SURFACES)[number];

export interface SurfaceMeta {
  surface: ModelSurface;
  label: string;
  hint: string;
  /** Auto-routing tier preference, best first. */
  prefTiers: ModelTier[];
  /** Tool-calling materially helps this surface (prefer tool-capable models). */
  needsTools: boolean;
}

/**
 * Per-surface metadata. `prefTiers` drives Auto routing: a chatty surface
 * prefers a fast model; heavy reasoning prefers the biggest that fits.
 */
export const SURFACE_META: Record<ModelSurface, SurfaceMeta> = {
  chat: {
    surface: "chat",
    label: "Ask the Guide (chat)",
    hint: "Conversational Q&A over your roadmap. Favours snappy responses.",
    prefTiers: ["balanced", "fast", "heavy"],
    needsTools: false,
  },
  breakdown: {
    surface: "breakdown",
    label: "Epic break-down",
    hint: "Splits an epic into milestones. Benefits from stronger reasoning + tools.",
    prefTiers: ["heavy", "balanced", "fast"],
    needsTools: true,
  },
  board: {
    surface: "board",
    label: "Chapter board planner",
    hint: "Arranges milestones into chapters. Stronger reasoning helps.",
    prefTiers: ["heavy", "balanced", "fast"],
    needsTools: true,
  },
  skills: {
    surface: "skills",
    label: "Skill suggestions",
    hint: "Suggests skills + constellation links. Balanced models do well.",
    prefTiers: ["balanced", "heavy", "fast"],
    needsTools: true,
  },
  coach: {
    surface: "coach",
    label: "Weekly coach + retrospective",
    hint: "Reflective briefings over your week. Prefers stronger reasoning.",
    prefTiers: ["heavy", "balanced", "fast"],
    needsTools: false,
  },
  import: {
    surface: "import",
    label: "Notes → JSON import",
    hint: "Strict JSON generation. Coder/balanced models are most reliable.",
    prefTiers: ["balanced", "heavy", "fast"],
    needsTools: false,
  },
  planning: {
    surface: "planning",
    label: "Planning (schedule, resources, journal, side quests)",
    hint: "General planning helpers. Balanced is the sweet spot.",
    prefTiers: ["balanced", "fast", "heavy"],
    needsTools: false,
  },
};

export const SURFACE_LIST: SurfaceMeta[] = MODEL_SURFACES.map((s) => SURFACE_META[s]);

/** An installed model enriched with the facts Auto routing needs. */
export interface RoutingCandidate {
  /** Normalized ref (":latest"-suffixed). */
  ref: string;
  tier?: ModelTier;
  tools: boolean;
  /** Loads within the RAM budget (fitFor !== "over"). */
  fits: boolean;
}

/**
 * Auto-pick the best installed model for a surface:
 *   1. Restrict to models that fit RAM (fall back to all if none fit).
 *   2. If the surface needs tools and any tool-capable model exists, restrict.
 *   3. Choose by the surface's tier preference order; ties broken by ref.
 * Returns null when there are no candidates at all.
 */
export function autoPickForSurface(
  surface: ModelSurface,
  candidates: RoutingCandidate[],
): string | null {
  if (candidates.length === 0) return null;
  const meta = SURFACE_META[surface];

  let pool = candidates.filter((c) => c.fits);
  if (pool.length === 0) pool = candidates; // nothing fits → consider everything

  if (meta.needsTools) {
    const withTools = pool.filter((c) => c.tools);
    if (withTools.length > 0) pool = withTools;
  }

  const tierRank = (t?: ModelTier) => {
    const i = t ? meta.prefTiers.indexOf(t) : -1;
    return i === -1 ? meta.prefTiers.length : i; // unknown tier sorts last
  };

  pool.sort((a, b) => {
    const r = tierRank(a.tier) - tierRank(b.tier);
    return r !== 0 ? r : a.ref.localeCompare(b.ref);
  });

  return pool[0]?.ref ?? null;
}

/**
 * Generation speed in tokens/second from a streamed/completed Ollama response.
 * Returns null when inputs are missing or non-positive (don't show a badge).
 */
export function tokensPerSecond(
  tokens: number | undefined,
  durationMs: number | undefined,
): number | null {
  if (!tokens || !durationMs || tokens <= 0 || durationMs <= 0) return null;
  return (tokens / durationMs) * 1000;
}
