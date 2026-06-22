import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Ollama } from "ollama";

let cached: Ollama | null = null;

const DEFAULT_HOST = "http://localhost:11434";

/** Compile-time fallback: env override, else a sensible local default. */
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:14b";

/**
 * The model every AI action uses right now. Process-wide (Questline is a
 * single-user local desktop app), hydrated from the user's saved preference at
 * boot (src/instrumentation.ts) and updated when they switch in Model Manager
 * (models.setSelected). Read it via getActiveModel() at call time so a switch
 * takes effect immediately without restarting the server.
 */
let activeModel = DEFAULT_MODEL;

/**
 * Per-request model override. A single AI request (epic break-down, a chat
 * turn, the notes→JSON pipeline, …) runs inside `runWithModel(model, fn)`, and
 * `getActiveModel()` reads this scope first. This is how per-surface routing,
 * Auto routing, and explicit per-call model picks take effect WITHOUT mutating
 * the process-global default or leaking the choice into other in-flight calls.
 * Falls through to the global `activeModel` when no scope is active.
 */
const modelScope = new AsyncLocalStorage<string>();

/**
 * The model AI calls should use right now: the request-scoped override if one
 * is active, else the process-global active model.
 */
export function getActiveModel(): string {
  return modelScope.getStore() ?? activeModel;
}

/** Run `fn` with `model` bound as the active model for its async scope. */
export function runWithModel<T>(model: string, fn: () => T): T {
  const trimmed = model?.trim();
  return trimmed ? modelScope.run(trimmed, fn) : fn();
}

/** Change the process-global active model. Called by models.setSelected. */
export function setActiveModel(model: string): void {
  const trimmed = model.trim();
  if (trimmed) activeModel = trimmed;
}

/**
 * Lazily-constructed singleton Ollama client.
 * Defaults to http://localhost:11434 (the Ollama daemon's default port).
 *
 * Errors thrown here are user-friendly — tRPC surfaces them as the error
 * message in the AI Guide modal, so the wording matters.
 */
export function getOllama(): Ollama {
  if (cached) return cached;
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;
  cached = new Ollama({ host });
  return cached;
}

// ---------------------------------------------------------------------------
// Lazy model loading (no proactive warm-up)
//
// We intentionally do NOT preload the model on boot or keep it warm in the
// background. Loading a multi-GB model into memory just because the app is open
// pins RAM (and can thrash/swap) before the user has run any AI action. Ollama
// loads the model automatically on the first inference (a one-time cold-load
// delay) and unloads it after its default idle keep-alive, so memory is only
// used while the AI is actually in use.
// ---------------------------------------------------------------------------

/**
 * Unload the active model from memory immediately, freeing RAM. Ollama keeps a
 * model resident for ~5 min after the last call by default; for one-shot
 * background briefings (Weekly Coach, retrospective) that idle residency pins
 * many GB (especially a 30B model) long after the result is shown. We send a
 * zero-token request with `keep_alive: 0`, which tells Ollama to evict the
 * model as soon as it's done. Best-effort: errors are swallowed.
 */
export async function unloadActiveModel(model?: string): Promise<void> {
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;
  const target = model ?? getActiveModel();
  try {
    await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: target, keep_alive: 0 }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best effort — if the daemon is gone there's nothing to unload */
  }
}

/**
 * Is the configured model currently resident in memory? Queries Ollama's
 * /api/ps (the list of running models). Returns false on any error.
 */
export async function isModelLoaded(): Promise<boolean> {
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;
  try {
    const res = await fetch(`${host}/api/ps`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { models?: { name: string }[] };
    const active = getActiveModel();
    return (body.models ?? []).some((m) => m.name === active);
  } catch {
    return false;
  }
}

/**
 * Translate Ollama transport errors into clear, actionable messages.
 * Distinguishes "daemon not running" from "model not pulled" because the fix
 * is different for each.
 */
export function describeOllamaError(err: unknown, model: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;

  // Connection refused / fetch failed → daemon isn't running
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("fetch failed") ||
    message.includes("Failed to fetch") ||
    message.includes("ENOTFOUND")
  ) {
    return `Can't reach Ollama at ${host}. Open the Ollama app from your menu bar (or run \`ollama serve\` in a terminal).`;
  }

  // Model not found → user needs to pull it
  if (
    /model.*not found/i.test(message) ||
    /try pulling/i.test(message) ||
    message.includes("404")
  ) {
    return `Model "${model}" isn't installed yet. Pull it from More → AI Models (or run \`ollama pull ${model}\`).`;
  }

  return `Ollama error: ${message}`;
}

/**
 * Normalized names of every model installed in the engine (Ollama /api/tags).
 * Returns [] on any error (engine down) — callers must treat empty as "unknown"
 * rather than "nothing installed". Powers the boot-time active-model fallback.
 */
export async function listInstalledModels(): Promise<string[]> {
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;
  try {
    const res = await fetch(`${host}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) =>
      m.name.includes(":") ? m.name : `${m.name}:latest`,
    );
  } catch {
    return [];
  }
}
