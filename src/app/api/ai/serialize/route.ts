import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import {
  structuredToJsonStream,
  type AiStreamEvent,
} from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

/**
 * POST /api/ai/serialize
 *
 * Streams Ollama's response while converting structured Questline notes
 * into ProfileJson. Body: { structured: string }.
 *
 * The output should be a single valid JSON object (per HELP_PROMPT_JSON
 * rules). The client buffers the stream and validates with the
 * ProfileJson Zod schema before letting the user advance to /ai/commit.
 */

const bodySchema = z.object({ structured: z.string().min(1).max(200_000) });

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
          // client disconnected
        }
      };
      try {
        await runForSurface(session.user.id, "import", () =>
          structuredToJsonStream(body.structured, emit),
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
