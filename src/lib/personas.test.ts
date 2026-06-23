import { describe, it, expect } from "vitest";
import { MODEL_SURFACES } from "./model-routing";
import { SURFACE_PERSONA, personaFor, composeSystemPrompt } from "./personas";

describe("personas", () => {
  it("defines a persona for every routing surface", () => {
    for (const s of MODEL_SURFACES) {
      expect(SURFACE_PERSONA[s]).toBeTruthy();
      expect(SURFACE_PERSONA[s]).toContain("The Guide");
    }
  });

  it("keeps the coach plain-text rule (the original garbled-output fix)", () => {
    expect(personaFor("coach")).toMatch(/PLAIN TEXT ONLY/);
  });

  it("lets chat use Markdown + LaTeX (Phase 2 synergy)", () => {
    expect(personaFor("chat")).toMatch(/LaTeX/);
  });

  it("composes persona + task + house style in order", () => {
    const out = composeSystemPrompt("chat", "TASK_RULES", "Respond in Spanish.");
    expect(out.indexOf("The Guide")).toBeLessThan(out.indexOf("TASK_RULES"));
    expect(out.indexOf("TASK_RULES")).toBeLessThan(out.indexOf("Respond in Spanish."));
  });

  it("omits the task and house-style sections when not provided", () => {
    expect(composeSystemPrompt("coach")).toBe(SURFACE_PERSONA.coach);
    expect(composeSystemPrompt("coach", "  ", "  ")).toBe(SURFACE_PERSONA.coach);
  });
});
