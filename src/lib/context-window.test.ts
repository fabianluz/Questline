import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  MAX_NUM_CTX,
  MIN_NUM_CTX,
  numCtxForPrompt,
  recommendNumCtx,
} from "./context-window";

describe("estimateTokens", () => {
  it("is ~chars/4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("recommendNumCtx", () => {
  it("never returns less than the floor (guards Ollama's 2048 default)", () => {
    expect(recommendNumCtx(0)).toBe(MIN_NUM_CTX);
    expect(recommendNumCtx(100)).toBe(MIN_NUM_CTX);
  });

  it("rounds up to a standard window above prompt + headroom", () => {
    // 5000 + 1024 headroom = 6024 → next window 8192
    expect(recommendNumCtx(5000)).toBe(8192);
    // 3000 + 1024 = 4024 → 4096
    expect(recommendNumCtx(3000)).toBe(4096);
  });

  it("clamps to the ceiling", () => {
    expect(recommendNumCtx(500_000)).toBe(MAX_NUM_CTX);
  });

  it("respects a smaller model max", () => {
    expect(recommendNumCtx(20_000, { modelMaxTokens: 8192 })).toBe(8192);
  });

  it("honors custom response headroom", () => {
    // 7000 + 4000 = 11000 → 16384
    expect(recommendNumCtx(7000, { responseHeadroom: 4000 })).toBe(16384);
  });
});

describe("numCtxForPrompt", () => {
  it("sizes from joined prompt text", () => {
    // ~12000 chars → 3000 tokens → +1024 = 4024 → 4096
    expect(numCtxForPrompt("x".repeat(12_000))).toBe(4096);
  });
  it("accepts an array of segments", () => {
    const big = "y".repeat(40_000); // 10000 tokens
    expect(numCtxForPrompt([big, big])).toBe(MAX_NUM_CTX); // 20000+ → clamp
  });
});
