"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Download, X } from "lucide-react";

/**
 * Modal for showing a long prompt the user will paste into an external LLM.
 * Two affordances: Copy to clipboard, Download as .txt (so they can keep a
 * versioned local copy if they iterate on it). The prompt is intentionally
 * shown in a scrollable monospace block — these prompts are long.
 */
export function PromptCopyDialog({
  open,
  onClose,
  title,
  subtitle,
  prompt,
  filename,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  prompt: string;
  filename: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  function copy() {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([prompt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="jrpg-panel relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <div>
            <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
              📜 {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-xs text-jrpg-muted">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded-md border border-jrpg-gold/30 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-jrpg-gold-bright">
            {prompt}
          </pre>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-jrpg-gold/40 p-4">
          <p className="text-[10px] text-jrpg-muted">
            Paste this into any LLM (ChatGPT, Claude, your local Ollama
            chat, etc.). Append your raw notes after the prompt.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={download}
              className="jrpg-btn jrpg-btn--ghost inline-flex items-center gap-1"
              title="Download as a .txt file so you can iterate on it locally"
            >
              <Download className="h-3 w-3" /> .txt
            </button>
            <button
              onClick={copy}
              className="jrpg-btn inline-flex items-center gap-1"
              title="Copy the full prompt to your clipboard"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <ClipboardCopy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
