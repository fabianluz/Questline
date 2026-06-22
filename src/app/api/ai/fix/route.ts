import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import {
  fixProfileJsonStream,
  type AiStreamEvent,
} from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

/**
 * POST /api/ai/fix
 *
 * Streams Ollama's corrected JSON output given the previous bad JSON +
 * a summary of the Zod validation errors. Used by /ai/serialize's
 * "Fix with AI" button when the initial generation produced invalid
 * ProfileJson.
 *
 * Body:
 *   { badJson: string, errors: string }
 *
 * SSE events match AiStreamEvent.
 */

const bodySchema = z.object({
  badJson: z.string().min(1).max(200_000),
  errors: z.string().min(1).max(40_000),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AiStreamEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          /* client disconnected */
        }
      };
      try {
        await runForSurface(session.user.id, "import", () =>
          fixProfileJsonStream(body.badJson, body.errors, emit),
        );
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
