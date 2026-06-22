import "server-only";
import { spawn } from "node:child_process";

/**
 * POST /api/system/start/<service>
 *
 * Starts an external runtime the app depends on, by shelling out
 * server-side. Local-only convenience — Questline is single-user on the
 * developer's MBP, and the dev server listens on 127.0.0.1, so the only
 * caller is the user's own browser.
 *
 * Supported services:
 *   - "orbstack"  → `open -ga OrbStack`        (starts the Docker daemon)
 *   - "postgres"  → `docker compose up -d`     (brings up questline-postgres)
 *   - "ollama"    → `open -ga Ollama`          (starts the menu-bar app)
 *
 * Each command is fire-and-forget: we spawn it detached, unref, and
 * return immediately. The SystemHealthBanner polls /api/health to confirm
 * the service actually came up afterward.
 *
 * Errors during spawn (e.g. command not on PATH) are reported back as
 * JSON so the UI can surface them inline.
 */

type ServiceDef = {
  label: string;
  cmd: string;
  args: string[];
  /** Friendly summary shown in the response. */
  what: string;
};

const SERVICES: Record<string, ServiceDef> = {
  orbstack: {
    label: "OrbStack",
    cmd: "open",
    args: ["-ga", "OrbStack"],
    what: "Launching the OrbStack app (provides the Docker daemon).",
  },
  postgres: {
    label: "Postgres container",
    cmd: "docker",
    args: ["compose", "up", "-d"],
    what:
      "Running `docker compose up -d` to bring the questline-postgres container online.",
  },
  ollama: {
    label: "Ollama",
    cmd: "open",
    args: ["-ga", "Ollama"],
    what: "Launching the Ollama menu-bar app (provides the local LLM runtime).",
  },
};

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ service: string }> },
) {
  const { service } = await ctx.params;
  const def = SERVICES[service];
  if (!def) {
    return Response.json(
      {
        ok: false,
        error: `Unknown service "${service}". Supported: ${Object.keys(SERVICES).join(", ")}.`,
      },
      { status: 404 },
    );
  }

  try {
    // `detached: true` + `unref()` means the spawned process survives our
    // request and the parent doesn't wait on it. `open -ga` and
    // `docker compose up -d` both return quickly themselves, but this
    // guarantees we never hang the response.
    const child = spawn(def.cmd, def.args, {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.on("error", (err) => {
      // Swallow — we've already returned to the client. The next /api/health
      // poll will reveal whether the runtime actually came up.
      console.warn(`[/api/system/start/${service}] spawn error:`, err);
    });
    child.unref();

    return Response.json({
      ok: true,
      service,
      label: def.label,
      what: def.what,
      pid: child.pid ?? null,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        service,
        label: def.label,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
