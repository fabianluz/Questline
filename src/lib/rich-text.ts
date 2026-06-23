/**
 * Tiny inline tokenizer for the AI surfaces (trimmed port of Arcadia's
 * obsidian/render `tokenizeInline`). Questline has no markdown library — chat /
 * coach / journal text is rendered ad-hoc — so this gives just enough structure
 * to render **bold**, *italic* / _italic_, `code`, and LaTeX `$math$` inline,
 * with block `$$math$$` handled by the RichText component. Pure + dependency
 * free so it's unit tested; the component layers KaTeX + React on top.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "math"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string };

// Order of alternatives = precedence: math → code → bold → italic(* or _).
// Each is non-greedy and single-line so an unterminated marker (common while a
// response is still streaming) is left as plain text until it closes.
const INLINE_RE =
  /(\$[^$\n]+?\$)|(`[^`\n]+?`)|(\*\*[^\n]+?\*\*)|(\*[^*\n]+?\*)|(_[^_\n]+?_)/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(text); m; m = INLINE_RE.exec(text)) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    const raw = m[0];
    if (m[1]) tokens.push({ type: "math", value: raw.slice(1, -1) });
    else if (m[2]) tokens.push({ type: "code", value: raw.slice(1, -1) });
    else if (m[3]) tokens.push({ type: "bold", value: raw.slice(2, -2) });
    else if (m[4]) tokens.push({ type: "italic", value: raw.slice(1, -1) });
    else if (m[5]) tokens.push({ type: "italic", value: raw.slice(1, -1) });
    last = m.index + raw.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

/** A renderable block: prose, display math, or a fenced code block. */
export type Block =
  | { type: "text"; value: string }
  | { type: "mathBlock"; value: string }
  | { type: "code"; lang: string; value: string };

const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

export function splitMathBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let last = 0;
  BLOCK_MATH_RE.lastIndex = 0;
  for (let m = BLOCK_MATH_RE.exec(md); m; m = BLOCK_MATH_RE.exec(md)) {
    if (m.index > last) blocks.push({ type: "text", value: md.slice(last, m.index) });
    blocks.push({ type: "mathBlock", value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < md.length) blocks.push({ type: "text", value: md.slice(last) });
  return blocks;
}

// ```lang\n…\n``` — captured greedily-lazy so only CLOSED fences match. An
// unterminated fence (common mid-stream) stays as text until it closes, so a
// half-written ```mermaid diagram never renders broken.
const FENCE_RE = /```([^\n`]*)\n?([\s\S]*?)```/g;

/**
 * Split markdown into fenced code blocks (`mermaid`, etc.) and, in the text
 * between them, `$$…$$` math blocks. Fences take precedence so a `$` inside a
 * code block is never treated as math.
 */
export function splitBlocks(md: string): Block[] {
  const out: Block[] = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  for (let m = FENCE_RE.exec(md); m; m = FENCE_RE.exec(md)) {
    if (m.index > last) out.push(...splitMathBlocks(md.slice(last, m.index)));
    out.push({
      type: "code",
      lang: (m[1] || "").trim().toLowerCase(),
      value: m[2].replace(/\n$/, ""),
    });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push(...splitMathBlocks(md.slice(last)));
  return out;
}
