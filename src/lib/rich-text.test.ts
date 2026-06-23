import { describe, it, expect } from "vitest";
import { tokenizeInline, splitMathBlocks, splitBlocks } from "./rich-text";

describe("tokenizeInline", () => {
  it("returns a single text token for plain text", () => {
    expect(tokenizeInline("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("extracts inline math, code, bold and italic", () => {
    expect(tokenizeInline("Impose $\\int f=1$ then **k** and `F(x)` and _why_")).toEqual([
      { type: "text", value: "Impose " },
      { type: "math", value: "\\int f=1" },
      { type: "text", value: " then " },
      { type: "bold", value: "k" },
      { type: "text", value: " and " },
      { type: "code", value: "F(x)" },
      { type: "text", value: " and " },
      { type: "italic", value: "why" },
    ]);
  });

  it("prefers bold over italic at a ** boundary", () => {
    expect(tokenizeInline("**strong**")).toEqual([{ type: "bold", value: "strong" }]);
    expect(tokenizeInline("*soft*")).toEqual([{ type: "italic", value: "soft" }]);
  });

  it("leaves an unterminated $ as plain text (mid-stream safe)", () => {
    expect(tokenizeInline("cost is $5 today")).toEqual([
      { type: "text", value: "cost is $5 today" },
    ]);
  });
});

describe("splitMathBlocks", () => {
  it("separates $$…$$ display math from surrounding text", () => {
    expect(splitMathBlocks("Before\n$$2^R \\ge M+R+1$$\nafter")).toEqual([
      { type: "text", value: "Before\n" },
      { type: "mathBlock", value: "2^R \\ge M+R+1" },
      { type: "text", value: "\nafter" },
    ]);
  });

  it("returns one text block when there is no display math", () => {
    expect(splitMathBlocks("just prose")).toEqual([
      { type: "text", value: "just prose" },
    ]);
  });
});

describe("splitBlocks", () => {
  it("extracts a fenced mermaid block with its language", () => {
    expect(splitBlocks("Here:\n```mermaid\ngraph TD;A-->B\n```\ndone")).toEqual([
      { type: "text", value: "Here:\n" },
      { type: "code", lang: "mermaid", value: "graph TD;A-->B" },
      { type: "text", value: "\ndone" },
    ]);
  });

  it("tags a fenceless-language block as plain code", () => {
    expect(splitBlocks("```\nplain\n```")).toEqual([
      { type: "code", lang: "", value: "plain" },
    ]);
  });

  it("still finds $$math$$ in the text around code fences", () => {
    expect(splitBlocks("$$x$$\n```js\n1\n```")).toEqual([
      { type: "mathBlock", value: "x" },
      { type: "text", value: "\n" },
      { type: "code", lang: "js", value: "1" },
    ]);
  });

  it("leaves an unterminated fence as text (mid-stream safe)", () => {
    expect(splitBlocks("```mermaid\ngraph TD")).toEqual([
      { type: "text", value: "```mermaid\ngraph TD" },
    ]);
  });
});
