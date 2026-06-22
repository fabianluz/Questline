import { z } from "zod";
import { router, protectedProcedure, createCallerFactory } from "../trpc";
import { dataioRouter } from "./dataio";
import { boardRouter } from "./board";
import { WorkspaceBundleJson } from "@/lib/json-shapes";

/**
 * Workspace bundle IO (Planning v2, Phase 6) — the frictionless one-shot.
 *
 * A WorkspaceBundle is the full Profile (entities) + the Chapter Board
 * (ordering overlay) in a single file. Kept in its own router so it can
 * compose the existing dataio.importProfile / board.importBoard procedures via
 * tRPC callers WITHOUT a self-reference (which would break router type
 * inference if these lived inside dataioRouter itself).
 */
const callDataio = createCallerFactory(dataioRouter);
const callBoard = createCallerFactory(boardRouter);

export const workspaceRouter = router({
  /** Export the full profile AND the chapter board as one ordered bundle. */
  export: protectedProcedure.query(async ({ ctx }) => {
    const dataio = callDataio(ctx);
    const board = callBoard(ctx);
    const [profile, chapterBoard] = await Promise.all([
      dataio.exportProfile(),
      board.exportBoard(),
    ]);
    return {
      kind: "workspace_bundle" as const,
      exportedAt: new Date().toISOString(),
      version: 1 as const,
      profile,
      chapterBoard,
    };
  }),

  /**
   * One-shot import: applies the profile first (so the board's node refs
   * resolve against the just-imported entities), then the chapter board.
   */
  import: protectedProcedure
    .input(
      z.object({
        bundle: WorkspaceBundleJson,
        profileMode: z.enum(["merge", "replace", "upsert"]).default("upsert"),
        boardMode: z.enum(["replace", "merge"]).default("merge"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await callDataio(ctx).importProfile({
        profile: input.bundle.profile,
        mode: input.profileMode,
      });
      const board = input.bundle.chapterBoard
        ? await callBoard(ctx).importBoard({
            json: input.bundle.chapterBoard,
            mode: input.boardMode,
          })
        : null;
      return { profile, board };
    }),
});
