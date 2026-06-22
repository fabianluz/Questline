import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import {
  notesToStructuredStream,
  type AiStreamEvent,
} from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

/**
 * POST /api/ai/restructure
 *
 * Streams Ollama's response while restructuring raw notes into
 * Questline-vocabulary markdown. Body: { rawNotes: string }.
 * SSE event shape matches AiStreamEvent (start / token / done / error).
 */

const bodySchema = z.object({ rawNotes: z.string().min(1).max(200_000) });

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
          notesToStructuredStream(body.rawNotes, emit),
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
