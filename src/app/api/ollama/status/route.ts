import "server-only";
import { getActiveModel } from "@/lib/ollama";

/**
 * GET /api/ollama/status
 *
 * Lightweight reachability check used by the dashboard "Ollama Status" card.
 * Hits Ollama's HTTP API directly (not the SDK) so a transport failure
 * doesn't leak via the throwing SDK pathway — we want a JSON response either
 * way so the UI can render a status badge.
 *
 * Response shape:
 *   { reachable: boolean, model: string, modelInstalled: boolean,
 *     installedModels: string[], host: string, error?: string }
 */
export const dynamic = "force-dynamic";

const DEFAULT_HOST = "http://localhost:11434";

export async function GET() {
  const host = process.env.OLLAMA_BASE_URL ?? DEFAULT_HOST;
  const model = getActiveModel();

  try {
    const res = await fetch(`${host}/api/tags`, {
      method: "GET",
      cache: "no-store",
      // Tight timeout: if Ollama isn't up, the OS usually rejects fast
      // anyway; the 1.5s cap covers DNS lookups or stalled processes.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      return Response.json({
        reachable: false,
        model,
        modelInstalled: false,
        installedModels: [],
        host,
        error: `Ollama responded ${res.status}`,
      });
    }
    const body = (await res.json()) as {
      models?: Array<{ name: string }>;
    };
    const installed = (body.models ?? []).map((m) => m.name);
    // Ollama tags are like "qwen2.5:14b" — exact match required.
    const modelInstalled = installed.includes(model);
    return Response.json({
      reachable: true,
      model,
      modelInstalled,
      installedModels: installed,
      host,
    });
  } catch (err) {
    return Response.json({
      reachable: false,
      model,
      modelInstalled: false,
      installedModels: [],
      host,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
