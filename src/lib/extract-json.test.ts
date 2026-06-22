import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/extract-json";

const parse = (s: string) => JSON.parse(extractJson(s));

describe("extractJson", () => {
  it("passes through clean JSON", () => {
    expect(parse('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    expect(parse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores a leading preamble", () => {
    expect(parse('Here is the corrected JSON:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("ignores trailing commentary", () => {
    expect(parse('{"a":1}\n\nLet me know if you need changes!')).toEqual({
      a: 1,
    });
  });

  it("handles fences + preamble + trailing prose together", () => {
    const raw = 'Sure!\n```json\n{"epics":[{"title":"X"}]}\n```\nDone.';
    expect(parse(raw)).toEqual({ epics: [{ title: "X" }] });
  });

  it("handles arrays", () => {
    expect(parse("```json\n[1,2,3]\n```")).toEqual([1, 2, 3]);
  });

  it("keeps inner braces intact", () => {
    expect(parse('prefix {"a":{"b":2}} suffix')).toEqual({ a: { b: 2 } });
  });
});
