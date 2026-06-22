/**
 * Context-window guard.
 *
 * Ollama defaults `num_ctx` to 2048 tokens. Several Questline surfaces inject a
 * large context (the whole roadmap into Ask the Guide, all existing milestones
 * into epic break-down), which silently overflows that default — the model
 * never sees the tail of the prompt. These helpers estimate the prompt size and
 * request an adequate window, clamped so we never blow up RAM.
 *
 * Pure (no I/O) so it's unit-testable.
 */

/** Lower bound — never request less than Ollama's tiny default would allow. */
export const MIN_NUM_CTX = 4096;
/** Upper bound — plenty for a roadmap; keeps memory/latency reasonable. */
export const MAX_NUM_CTX = 16384;

/** Rough token estimate for English text (~4 chars/token). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Pick a `num_ctx` that fits `promptTokens` plus room for the response.
 * Rounds up to a standard power-of-two window, clamped to [MIN, MAX] and to the
 * model's own maximum context (when known).
 */
export function recommendNumCtx(
  promptTokens: number,
  opts: { responseHeadroom?: number; modelMaxTokens?: number } = {},
): number {
  const headroom = opts.responseHeadroom ?? 1024;
  const needed = Math.max(0, promptTokens) + headroom;

  const ladder = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
  let pick = ladder.find((w) => w >= needed) ?? ladder[ladder.length - 1];

  pick = Math.max(MIN_NUM_CTX, Math.min(MAX_NUM_CTX, pick));
  if (opts.modelMaxTokens && opts.modelMaxTokens > 0) {
    pick = Math.min(pick, opts.modelMaxTokens);
  }
  return pick;
}

/**
 * Convenience: size the window directly from the prompt text(s).
 * Pass everything the model will see (system + messages).
 */
export function numCtxForPrompt(
  text: string | string[],
  opts?: { responseHeadroom?: number; modelMaxTokens?: number },
): number {
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return recommendNumCtx(estimateTokens(joined), opts);
}
