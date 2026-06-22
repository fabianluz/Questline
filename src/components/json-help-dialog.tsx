"use client";

import { useState } from "react";
import { Check, ClipboardCopy, HelpCircle, Sparkles, X } from "lucide-react";
import { buildLlmPrompt, SHAPES, type ShapeKey } from "@/lib/json-shapes";

/**
 * Round (?) icon that opens a modal showing the JSON schema example and a
 * "Copy as LLM prompt" button. Used inline next to every Import / Export
 * control so the user can ask an LLM "give me X in this exact shape" with
 * zero friction.
 */
export function JsonHelpDialog({
  shape: shapeKey,
  size = "sm",
  className,
}: {
  shape: ShapeKey;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const shape = SHAPES[shapeKey];

  const iconSize =
    size === "xs" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  async function copy(text: string, which: "example" | "prompt") {
    await navigator.clipboard.writeText(text);
    if (which === "example") {
      setCopiedExample(true);
      setTimeout(() => setCopiedExample(false), 1500);
    } else {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`See JSON shape for ${shape.title}`}
        className={
          "inline-flex items-center justify-center rounded-full text-jrpg-gold/70 hover:text-jrpg-gold-bright " +
          (className ?? "")
        }
      >
        <HelpCircle className={iconSize} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="jrpg-panel relative w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
              <div>
                <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
                  📜 {shape.title} schema
                </h2>
                <p className="mt-1 text-xs text-jrpg-muted">
                  {shape.summary}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {shape.notes && (
              <p className="border-b border-jrpg-gold/30 bg-jrpg-violet/10 px-4 py-2 text-xs italic text-jrpg-fg">
                {shape.notes}
              </p>
            )}

            <div className="max-h-[55vh] overflow-y-auto p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-pixel text-[10px] uppercase text-jrpg-gold-bright">
                  Example
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      copy(JSON.stringify(shape.example, null, 2), "example")
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-jrpg-gold/40 px-2 py-0.5 font-pixel text-[10px] uppercase text-jrpg-gold-bright hover:bg-jrpg-violet/40"
                  >
                    {copiedExample ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <ClipboardCopy className="h-3 w-3" />
                    )}
                    Copy JSON
                  </button>
                  <button
                    onClick={() =>
                      copy(buildLlmPrompt(shape), "prompt")
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-jrpg-gold bg-jrpg-violet/60 px-2 py-0.5 font-pixel text-[10px] uppercase text-jrpg-gold-bright hover:bg-jrpg-violet/80"
                    title="Copy a focused prompt you can paste into any LLM"
                  >
                    {copiedPrompt ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Copy as LLM prompt
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto rounded-md border border-jrpg-gold/30 bg-black/40 p-3 font-mono text-xs leading-relaxed text-jrpg-gold-bright">
                {JSON.stringify(shape.example, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
