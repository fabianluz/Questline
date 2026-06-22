import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { chatWithGuideStream, type AiStreamEvent } from "@/lib/advisor";
import { runForSurface } from "@/server/model-routing";

/**
 * POST /api/ai/guide — streams a chat reply from "The Guide", grounded in the
 * signed-in user's roadmap. Body: { messages: [{role,content}] }. SSE events
 * match AiStreamEvent (start / token / done / error). 100% local.
 */

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
  // Optional per-conversation model override (header quick-switcher / picker).
  model: z.string().min(1).max(120).optional(),
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* client disconnected */
        }
      };
      try {
        await runForSurface(
          session.user.id,
          "chat",
          () => chatWithGuideStream(session.user.id, body.messages, emit),
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
