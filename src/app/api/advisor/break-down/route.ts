import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { breakDownEpicStream } from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";
import type { AdvisorEvent } from "@/lib/advisor-types";

const bodySchema = z.object({
  epicId: z.string().uuid(),
  model: z.string().min(1).max(120).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AdvisorEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream may have been closed by the client — best-effort drop.
        }
      };
      try {
        await runForSurface(
          session.user.id,
          "breakdown",
          () => breakDownEpicStream(session.user.id, body.epicId, emit),
          body.model,
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
          // already closed
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
