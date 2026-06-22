import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";

/**
 * POST /api/models/pull — download an Ollama model, streaming progress as SSE.
 * Body: { model: string }. Events:
 *   { type: "progress", status, completed?, total? }
 *   { type: "done" } | { type: "error", message }
 * Auth-guarded; proxies Ollama's NDJSON /api/pull stream. 100% local.
 */

const bodySchema = z.object({ model: z.string().min(1).max(120) });
const HOST = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  let model: string;
  try {
    model = bodySchema.parse(await req.json()).model.trim();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      try {
        const res = await fetch(`${HOST}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, stream: true }),
          // Client disconnect (Stop / page close) aborts the upstream pull too.
          signal: req.signal,
        });
        if (!res.ok || !res.body) {
          emit({ type: "error", message: `Ollama responded HTTP ${res.status}` });
          controller.close();
          return;
        }
        // Ollama streams NDJSON: one JSON object per line.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const chunk = JSON.parse(t) as {
                status?: string;
                error?: string;
                completed?: number;
                total?: number;
              };
              if (chunk.error) {
                emit({ type: "error", message: chunk.error });
                continue;
              }
              emit({
                type: "progress",
                status: chunk.status ?? "",
                completed: chunk.completed,
                total: chunk.total,
              });
            } catch {
              /* skip a partial / non-JSON line */
            }
          }
        }
        emit({ type: "done" });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
