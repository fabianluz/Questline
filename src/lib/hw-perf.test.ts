import { describe, it, expect } from "vitest";
import {
  chipBandwidth,
  estimateTokensPerSec,
  speedLabel,
  quantBits,
  isLowQuant,
  quantQuality,
} from "./hw-perf";

describe("chipBandwidth", () => {
  it("matches specific families before the bare chip", () => {
    expect(chipBandwidth("Apple M4 Pro")).toBe(273);
    expect(chipBandwidth("Apple M4 Max")).toBe(410);
    expect(chipBandwidth("Apple M4")).toBe(120);
  });
  it("is case-insensitive and substring-tolerant", () => {
    expect(chipBandwidth("apple m1 ultra")).toBe(800);
  });
  it("returns null for unknown / missing chips", () => {
    expect(chipBandwidth("Intel Core i9")).toBeNull();
    expect(chipBandwidth(undefined)).toBeNull();
    expect(chipBandwidth(null)).toBeNull();
  });
});

describe("estimateTokensPerSec", () => {
  it("is bandwidth / size × efficiency", () => {
    // M4 (120 GB/s), 4 GB model → (120/4)*0.55 = 16.5
    expect(estimateTokensPerSec(4_000_000_000, "Apple M4")).toBeCloseTo(16.5, 1);
  });
  it("smaller models decode faster", () => {
    const small = estimateTokensPerSec(2_000_000_000, "Apple M3 Max")!;
    const big = estimateTokensPerSec(18_000_000_000, "Apple M3 Max")!;
    expect(small).toBeGreaterThan(big);
  });
  it("returns null without a known chip or a size", () => {
    expect(estimateTokensPerSec(4e9, "Intel")).toBeNull();
    expect(estimateTokensPerSec(0, "Apple M4")).toBeNull();
    expect(estimateTokensPerSec(undefined, "Apple M4")).toBeNull();
  });
});

describe("speedLabel", () => {
  it("tiers by throughput", () => {
    expect(speedLabel(40)!.tier).toBe("fast");
    expect(speedLabel(12)!.tier).toBe("ok");
    expect(speedLabel(4)!.tier).toBe("slow");
  });
  it("formats with one decimal under 10", () => {
    expect(speedLabel(4.2)!.text).toBe("≈4.2 tok/s");
    expect(speedLabel(40)!.text).toBe("≈40 tok/s");
  });
  it("is null for a null estimate", () => {
    expect(speedLabel(null)).toBeNull();
  });
});

describe("quant helpers", () => {
  it("parses bit width from labels", () => {
    expect(quantBits("Q4_K_M")).toBe(4);
    expect(quantBits("q3_K_S")).toBe(3);
    expect(quantBits("F16")).toBe(16);
    expect(quantBits(undefined)).toBeNull();
  });
  it("flags ≤Q3 as low-quant", () => {
    expect(isLowQuant("Q3_K_M")).toBe(true);
    expect(isLowQuant("Q2_K")).toBe(true);
    expect(isLowQuant("Q4_K_M")).toBe(false);
    expect(isLowQuant(undefined)).toBe(false);
  });
  it("maps bit width to a quality hint", () => {
    expect(quantQuality("Q3_K_M")).toBe("lower quality");
    expect(quantQuality("Q4_K_M")).toBe("good quality");
    expect(quantQuality("Q5_K_M")).toBe("high quality");
    expect(quantQuality("F16")).toBe("max quality");
    expect(quantQuality(null)).toBeNull();
  });
});
