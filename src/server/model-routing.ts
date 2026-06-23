import "server-only";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { userPreference } from "@/server/db/schema";
import {
  DEFAULT_MODEL,
  getActiveModel,
  listInstalledModels,
  runWithModel,
} from "@/lib/ollama";
import { runWithAiContext } from "@/server/ai-context";
import { catalogByRef, fitFor, normalizeRef } from "@/lib/model-catalog";
import {
  autoPickForSurface,
  MODEL_SURFACES,
  type ModelSurface,
  type RoutingCandidate,
} from "@/lib/model-routing";

interface RoutingContext {
  installed: string[]; // normalized refs ([] if engine unreachable)
  verifiable: boolean;
  pref: { surfaceModels: Record<string, string> | null; autoRouteModels: boolean } | null;
  /** Free-text persona override appended to every surface's system prompt. */
  houseStyle: string | null;
}

async function loadContext(userId: string): Promise<RoutingContext> {
  const [installed, pref] = await Promise.all([
    listInstalledModels(),
    db.query.userPreference.findFirst({
      where: eq(userPreference.userId, userId),
      columns: { surfaceModels: true, autoRouteModels: true, houseStyle: true },
    }),
  ]);
  return {
    installed,
    verifiable: installed.length > 0,
    pref: pref
      ? { surfaceModels: pref.surfaceModels ?? null, autoRouteModels: pref.autoRouteModels }
      : null,
    houseStyle: pref?.houseStyle ?? null,
  };
}

/** Core selection (priority order) against a pre-loaded context — no I/O. */
function pickForSurface(
  ctx: RoutingContext,
  surface: ModelSurface,
  requested?: string | null,
): string {
  const isInstalled = (ref: string) =>
    !ctx.verifiable || ctx.installed.includes(normalizeRef(ref));

  // 1. explicit override
  const req = requested?.trim();
  if (req && isInstalled(req)) return req;

  // 2. per-surface override
  const pinned = ctx.pref?.surfaceModels?.[surface]?.trim();
  if (pinned && isInstalled(pinned)) return pinned;

  // 3. Auto routing
  if (ctx.pref?.autoRouteModels && ctx.verifiable) {
    const total = os.totalmem();
    const candidates: RoutingCandidate[] = ctx.installed.map((ref) => {
      const c = catalogByRef(ref);
      const fit = fitFor(c?.approxBytes, total);
      return {
        ref,
        tier: c?.tier,
        tools: c?.capabilities?.tools ?? false,
        fits: fit !== "over",
        fit,
      };
    });
    const pick = autoPickForSurface(surface, candidates);
    if (pick) return pick;
  }

  // 4. global active (or compile-time default)
  return getActiveModel() || DEFAULT_MODEL;
}

/**
 * Resolve which model an AI request should use, in priority order:
 *   1. Explicit per-request override (a per-call picker) — if installed.
 *   2. Per-surface pinned model (Model Manager) — if installed.
 *   3. Auto routing (if enabled) — best installed model for the surface.
 *   4. The process-global active model.
 *
 * "If installed" is skipped when the engine is unreachable (installed list
 * empty) so we can't wrongly reject a model we simply couldn't verify.
 */
export async function resolveModelForUser(
  userId: string,
  surface: ModelSurface,
  requested?: string | null,
): Promise<string> {
  return pickForSurface(await loadContext(userId), surface, requested);
}

/** Resolve the effective model for every surface in one engine round-trip
 *  (drives the "→ model" preview in the Model Manager settings). */
export async function resolveAllSurfaces(
  userId: string,
): Promise<Record<ModelSurface, string>> {
  const ctx = await loadContext(userId);
  const out = {} as Record<ModelSurface, string>;
  for (const s of MODEL_SURFACES) out[s] = pickForSurface(ctx, s);
  return out;
}

/**
 * Resolve the model for `surface` (honoring an optional per-call override),
 * then run `fn` with that model bound as the active model for its async scope.
 * Every `getActiveModel()` inside `fn` — across all advisor functions — returns
 * the resolved model without any signature changes.
 */
export async function runForSurface<T>(
  userId: string,
  surface: ModelSurface,
  fn: () => Promise<T>,
  requested?: string | null,
): Promise<T> {
  const ctx = await loadContext(userId);
  const model = pickForSurface(ctx, surface, requested);
  // Bind both the resolved model AND the AI context (surface + house style) for
  // the call's async scope, so advisor.ts reads them without signature changes.
  return runWithModel(model, () =>
    runWithAiContext({ surface, houseStyle: ctx.houseStyle }, fn),
  );
}
