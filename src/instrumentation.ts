/**
 * Next.js instrumentation hook — `register()` runs ONCE per server process,
 * at boot, before the app handles any request.
 *
 * We use it ONLY for cheap setup: apply embedded DB migrations and hydrate the
 * saved active-model *choice* (a string — no weights are loaded). We
 * deliberately do NOT preload the model here. Loading a multi-GB model into
 * memory just because the app opened pins RAM (and can thrash/swap) before the
 * user has asked the AI for anything. Instead the model loads lazily on the
 * first real AI action and unloads when idle.
 */
export async function register() {
  // Only the Node.js server runtime talks to the DB / Ollama — skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Embedded (desktop app) mode: apply DB migrations to the local PGlite store
  // before serving any request. Awaited so the first query can't race it.
  // No-op on the Postgres backend.
  const { ensureEmbeddedMigrations } = await import("@/server/db");
  await ensureEmbeddedMigrations();

  const { DEFAULT_MODEL, setActiveModel, listInstalledModels } =
    await import("@/lib/ollama");

  // Hydrate the active model from the saved preference so a model the user
  // switched to in a previous session is the active choice from boot. This only
  // sets a string — it does not load the model. Desktop is single-user, so the
  // first saved choice is THE choice; best-effort.
  // If the saved model was deleted since (and the engine is reachable so we can
  // tell), fall back to the default — or any installed model — so AI never
  // points at a model that no longer exists.
  try {
    const { db } = await import("@/server/db");
    const { userPreference } = await import("@/server/db/schema");
    const { isNotNull } = await import("drizzle-orm");
    const pref = await db.query.userPreference.findFirst({
      where: isNotNull(userPreference.aiModel),
      columns: { aiModel: true },
    });
    const saved = pref?.aiModel ?? null;
    const installed = await listInstalledModels();
    const norm = (r: string) => (r.includes(":") ? r : `${r}:latest`);
    const has = (r: string) => installed.includes(norm(r));

    if (installed.length === 0) {
      // Engine not reachable yet → can't verify; trust the saved choice.
      if (saved) setActiveModel(saved);
    } else if (saved && has(saved)) {
      setActiveModel(saved);
    } else {
      setActiveModel(has(DEFAULT_MODEL) ? DEFAULT_MODEL : (installed[0] ?? DEFAULT_MODEL));
    }
  } catch {
    /* no saved preference / DB not ready → keep the default */
  }
}
