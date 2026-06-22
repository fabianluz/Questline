import { describe, expect, it } from "vitest";
import {
  autoPickForSurface,
  MODEL_SURFACES,
  type RoutingCandidate,
  tokensPerSecond,
} from "./model-routing";

const fast: RoutingCandidate = { ref: "qwen2.5:7b", tier: "fast", tools: true, fits: true };
const balanced: RoutingCandidate = { ref: "qwen2.5:14b", tier: "balanced", tools: true, fits: true };
const heavy: RoutingCandidate = { ref: "qwen3:32b", tier: "heavy", tools: true, fits: true };
const gemma: RoutingCandidate = { ref: "gemma3:12b", tier: "balanced", tools: false, fits: true };

describe("autoPickForSurface", () => {
  it("returns null with no candidates", () => {
    expect(autoPickForSurface("chat", [])).toBeNull();
  });

  it("chat prefers balanced, then fast", () => {
    expect(autoPickForSurface("chat", [fast, balanced, heavy])).toBe("qwen2.5:14b");
    expect(autoPickForSurface("chat", [fast, heavy])).toBe("qwen2.5:7b");
  });

  it("breakdown prefers the heaviest available", () => {
    expect(autoPickForSurface("breakdown", [fast, balanced, heavy])).toBe("qwen3:32b");
    expect(autoPickForSurface("breakdown", [fast, balanced])).toBe("qwen2.5:14b");
  });

  it("excludes models that don't fit RAM when something else fits", () => {
    const bigOverRam: RoutingCandidate = { ...heavy, fits: false };
    expect(autoPickForSurface("breakdown", [balanced, bigOverRam])).toBe("qwen2.5:14b");
  });

  it("falls back to non-fitting models when nothing fits", () => {
    const onlyOver: RoutingCandidate = { ...heavy, fits: false };
    expect(autoPickForSurface("breakdown", [onlyOver])).toBe("qwen3:32b");
  });

  it("tool-needing surfaces prefer tool-capable models when available", () => {
    // gemma (balanced, no tools) vs heavy (tools): breakdown needsTools → heavy.
    expect(autoPickForSurface("breakdown", [gemma, heavy])).toBe("qwen3:32b");
  });

  it("non-tool surfaces ignore the tools requirement", () => {
    // import doesn't need tools; gemma is balanced (top pref) so it wins over fast.
    expect(autoPickForSurface("import", [gemma, fast])).toBe("gemma3:12b");
  });

  it("covers every declared surface without throwing", () => {
    for (const s of MODEL_SURFACES) {
      expect(autoPickForSurface(s, [fast, balanced, heavy])).toBeTruthy();
    }
  });
});

describe("tokensPerSecond", () => {
  it("computes tokens/sec", () => {
    expect(tokensPerSecond(100, 1000)).toBe(100);
    expect(tokensPerSecond(45, 2000)).toBe(22.5);
  });
  it("returns null for missing/invalid input", () => {
    expect(tokensPerSecond(0, 1000)).toBeNull();
    expect(tokensPerSecond(100, 0)).toBeNull();
    expect(tokensPerSecond(undefined, 1000)).toBeNull();
    expect(tokensPerSecond(100, undefined)).toBeNull();
  });
});
