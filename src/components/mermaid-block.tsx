"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Renders a fenced ```mermaid block (Phase 4) as an SVG diagram. Mermaid is
 * heavy and browser-only, so it's lazy-imported on first render — it never
 * touches the server bundle or initial chunk. On a parse error (the local model
 * emitted invalid diagram syntax) it falls back to the raw source so nothing is
 * lost. Runs in Electron's Chromium, where Mermaid renders reliably.
 */

let initialized = false;

async function getMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict", // no click handlers / raw HTML from model output
      theme: "dark",
      fontFamily: "inherit",
    });
    initialized = true;
  }
  return mermaid;
}

export function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const lastCode = useRef<string>("");

  useEffect(() => {
    if (code === lastCode.current) return;
    lastCode.current = code;
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(`mmd-${id}`, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) {
          setSvg(null);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (failed) {
    // Diagram syntax was invalid — show the source so the content survives.
    return (
      <pre className="my-1 overflow-x-auto rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 p-2 text-[11px] text-trails-fg-dim">
        <code>{code}</code>
      </pre>
    );
  }
  if (svg === null) {
    return (
      <div className="my-1 animate-pulse text-[11px] text-trails-fg-dim">
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      className="mermaid-diagram my-1 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
