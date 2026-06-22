import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { getActiveModel, isModelLoaded } from "@/lib/ollama";

/**
 * GET /api/health
 *
 * Aggregate liveness probe for every external runtime the app depends on.
 * Used by:
 *   - <SystemHealthBanner> on the (app) + (auth) layouts (polls every 20s)
 *   - <RequirementsSection> on the Tutorial page (polled every 10s while open)
 *
 * Response shape (stable — UI consumers depend on it):
 *
 *   {
 *     postgres: {
 *       reachable: boolean,
 *       version: string | null,    // "PostgreSQL 16.x" prefix only
 *       latencyMs: number | null,
 *       host: string,              // hostname:port from DATABASE_URL
 *       error: string | null,
 *     },
 *     ollama: {
 *       reachable: boolean,
 *       model: string,             // configured OLLAMA_MODEL
 *       modelInstalled: boolean,
 *       warm: boolean,             // model currently resident in memory
 *       installedModels: string[],
 *       host: string,
 *       error: string | null,
 *     },
 *     checkedAt: string,           // ISO timestamp
 *   }
 *
 * Read-only: this endpoint only *probes* status (Postgres ping, Ollama
 * /api/tags + /api/ps). It deliberately does NOT load or keep the model warm —
 * the model loads lazily on the first real AI action and unloads when idle, so
 * merely having the app open never pins multiple GB of RAM.
 *
 * Errors are caught and returned as strings — this endpoint NEVER 500s, so
 * the client banner can always render the diagnosis.
 */

export const dynamic = "force-dynamic";

const OLLAMA_DEFAULT_HOST = "http://localhost:11434";
const OLLAMA_TIMEOUT_MS = 1500;
const POSTGRES_TIMEOUT_MS = 1500;

export async function GET() {
  const [postgres, ollama] = await Promise.all([
    checkPostgres(),
    checkOllama(),
  ]);
  return Response.json({
    postgres,
    ollama,
    checkedAt: new Date().toISOString(),
  });
}

async function checkPostgres() {
  const host = extractDatabaseHost();
  const start = Date.now();
  try {
    // 1-row SELECT is the cheapest liveness check that still proves the
    // connection pool is wired up.
    const rows = await Promise.race([
      db.execute(sql`SELECT version() AS v`),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Postgres probe timed out")),
          POSTGRES_TIMEOUT_MS,
        ),
      ),
    ]);
    const latencyMs = Date.now() - start;
    const raw = String(
      (rows as { v?: string }[])[0]?.v ?? "",
    );
    // version() returns e.g. "PostgreSQL 16.5 (Debian 16.5-1.pgdg…) …" —
    // keep the leading product+version, drop the build platter.
    const version = raw.split(/\s+on\s+/i)[0] || raw || null;
    return {
      reachable: true,
      version,
      latencyMs,
      host,
      error: null as string | null,
    };
  } catch (err) {
    return {
      reachable: false,
      version: null,
      latencyMs: null,
      host,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkOllama() {
  const host = process.env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_HOST;
  const model = getActiveModel();
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        reachable: false,
        modelInstalled: false,
        warm: false,
        model,
        installedModels: [] as string[],
        host,
        error: `Ollama responded HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { models?: { name: string }[] };
    const installed = (body.models ?? []).map((m) => m.name);
    const modelInstalled = installed.includes(model);

    // Report whether the model is currently resident — read-only (/api/ps).
    // We deliberately do NOT load or keep it warm here: the model loads lazily
    // on the first real AI action and unloads on idle, so the app doesn't pin
    // multiple GB of RAM just for being open. (`/api/ps` never triggers a load.)
    const warm = modelInstalled ? await isModelLoaded() : false;

    return {
      reachable: true,
      modelInstalled,
      warm,
      model,
      installedModels: installed,
      host,
      error: null as string | null,
    };
  } catch (err) {
    return {
      reachable: false,
      modelInstalled: false,
      warm: false,
      model,
      installedModels: [] as string[],
      host,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Pull host:port from DATABASE_URL — handy display detail in diagnostics. */
function extractDatabaseHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(unset)";
  }
}
