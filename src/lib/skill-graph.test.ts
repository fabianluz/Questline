import { describe, it, expect } from "vitest";
import { planSkillLinks, type SkillEdge } from "@/lib/skill-graph";

const ids = new Set(["a", "b", "c", "d"]);

describe("planSkillLinks", () => {
  it("accepts a simple valid edge", () => {
    expect(planSkillLinks([], [{ skillId: "a", requiredSkillId: "b" }], ids)).toEqual([
      { skillId: "a", requiredSkillId: "b" },
    ]);
  });

  it("drops self-links", () => {
    expect(planSkillLinks([], [{ skillId: "a", requiredSkillId: "a" }], ids)).toEqual([]);
  });

  it("drops edges referencing unknown skills", () => {
    expect(planSkillLinks([], [{ skillId: "a", requiredSkillId: "z" }], ids)).toEqual([]);
  });

  it("drops duplicates of existing edges", () => {
    const existing: SkillEdge[] = [{ skillId: "a", requiredSkillId: "b" }];
    expect(
      planSkillLinks(existing, [{ skillId: "a", requiredSkillId: "b" }], ids),
    ).toEqual([]);
  });

  it("drops duplicates within the candidate batch", () => {
    const out = planSkillLinks(
      [],
      [
        { skillId: "a", requiredSkillId: "b" },
        { skillId: "a", requiredSkillId: "b" },
      ],
      ids,
    );
    expect(out).toHaveLength(1);
  });

  it("rejects an edge that would create a cycle", () => {
    // a -> b already; adding b -> a closes the loop.
    const existing: SkillEdge[] = [{ skillId: "a", requiredSkillId: "b" }];
    expect(
      planSkillLinks(existing, [{ skillId: "b", requiredSkillId: "a" }], ids),
    ).toEqual([]);
  });

  it("rejects a transitive cycle", () => {
    // a -> b -> c already; adding c -> a closes a 3-node loop.
    const existing: SkillEdge[] = [
      { skillId: "a", requiredSkillId: "b" },
      { skillId: "b", requiredSkillId: "c" },
    ];
    expect(
      planSkillLinks(existing, [{ skillId: "c", requiredSkillId: "a" }], ids),
    ).toEqual([]);
  });

  it("accepts a DAG diamond (no cycle)", () => {
    // a -> b, a -> c, then b -> d and c -> d are both safe.
    const existing: SkillEdge[] = [
      { skillId: "a", requiredSkillId: "b" },
      { skillId: "a", requiredSkillId: "c" },
    ];
    const out = planSkillLinks(
      existing,
      [
        { skillId: "b", requiredSkillId: "d" },
        { skillId: "c", requiredSkillId: "d" },
      ],
      ids,
    );
    expect(out).toHaveLength(2);
  });
});
