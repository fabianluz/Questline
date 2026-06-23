import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ModelSurface } from "@/lib/model-routing";

/**
 * Request-scoped AI context — the surface being served and the player's
 * house-style override — set once by `runForSurface` and read by advisor.ts
 * when it builds a system prompt (via `composeSystemPrompt`). This mirrors how
 * the model is bound via the ollama model scope: no advisor signature has to
 * thread the house style through. Outside a scope the getters return undefined,
 * so non-routed callers simply get the default persona.
 */
interface AiContext {
  surface?: ModelSurface;
  houseStyle?: string | null;
}

const scope = new AsyncLocalStorage<AiContext>();

export function runWithAiContext<T>(ctx: AiContext, fn: () => T): T {
  return scope.run(ctx, fn);
}

/** The player's house-style override for the in-flight request, if any. */
export function getHouseStyle(): string | null | undefined {
  return scope.getStore()?.houseStyle;
}

export function getAiSurface(): ModelSurface | undefined {
  return scope.getStore()?.surface;
}
