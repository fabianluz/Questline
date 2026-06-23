"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import {
  tokenizeInline,
  splitBlocks,
  type InlineToken,
} from "@/lib/rich-text";
import { MermaidBlock } from "@/components/mermaid-block";

/**
 * Lightweight rich-text renderer for AI/markdown-ish content: LaTeX math
 * (`$inline$` + `$$block$$`) via KaTeX, plus **bold**, *italic*, `code`, and
 * `- ` bullets — newlines preserved. Built because Questline has no markdown
 * library and its study content is formula-heavy (∫f=1→k, IEEE-754, Hamming).
 * Degrades gracefully: malformed math renders as red KaTeX (throwOnError:false)
 * or, on a hard failure, as plain code; unterminated markers stay literal.
 */

function katexHtml(expr: string, display: boolean): string | null {
  try {
    return katex.renderToString(expr, {
      throwOnError: false,
      displayMode: display,
      output: "html",
    });
  } catch {
    return null;
  }
}

function Math({ expr, display }: { expr: string; display: boolean }) {
  const html = katexHtml(expr, display);
  if (html === null) return <code>{expr}</code>;
  return (
    <span
      className={display ? "my-1 block overflow-x-auto text-center" : ""}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "math":
            return <Math key={i} expr={t.value} display={false} />;
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-trails-bg-deep/60 px-1 py-0.5 font-mono text-[0.85em]"
              >
                {t.value}
              </code>
            );
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                {t.value}
              </strong>
            );
          case "italic":
            return <em key={i}>{t.value}</em>;
          default:
            return <span key={i}>{t.value}</span>;
        }
      })}
    </>
  );
}

const BULLET_RE = /^\s*[-*•]\s+/;

/** A run of normal text: bullet lines become a list, others paragraphs. */
function TextBlock({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={key} className="ml-1 list-none space-y-0.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="select-none text-trails-accent">•</span>
            <span>
              <Inline tokens={tokenizeInline(b.replace(BULLET_RE, ""))} />
            </span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((line, i) => {
    if (BULLET_RE.test(line)) {
      bullets.push(line);
      return;
    }
    flushBullets(`ul-${i}`);
    if (line.trim() === "") return; // collapse blank lines into list/para gaps
    out.push(
      <p key={`p-${i}`} className="leading-snug">
        <Inline tokens={tokenizeInline(line)} />
      </p>,
    );
  });
  flushBullets("ul-end");
  return <>{out}</>;
}

/** A non-mermaid fenced code block: monospace, horizontally scrollable. */
function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="my-1 overflow-x-auto rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 p-2 text-[12px] leading-snug text-trails-fg">
      <code>{value}</code>
    </pre>
  );
}

export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = splitBlocks(text);
  return (
    <div className={cn("space-y-1.5", className)}>
      {blocks.map((b, i) => {
        if (b.type === "mathBlock") return <Math key={i} expr={b.value} display />;
        if (b.type === "code")
          return b.lang === "mermaid" ? (
            <MermaidBlock key={i} code={b.value} />
          ) : (
            <CodeBlock key={i} value={b.value} />
          );
        return <TextBlock key={i} text={b.value} />;
      })}
    </div>
  );
}
