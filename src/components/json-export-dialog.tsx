"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Download, X } from "lucide-react";

/**
 * Generic "show me the JSON for this thing" modal. Caller passes the data
 * already serialised (no shape opinion here — the dataio router or page
 * component fetches and formats it). The dialog provides:
 *   - syntax-highlighted-ish JSON view
 *   - Copy to clipboard
 *   - Download as `<filename>.json`
 */
export function JsonExportDialog({
  open,
  onClose,
  title,
  filename,
  data,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  filename: string;
  data: unknown;
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const text = JSON.stringify(data, null, 2);

  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
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
        className="jrpg-panel relative w-full max-w-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
            📤 Export · {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <pre className="rounded-md border border-jrpg-gold/30 bg-black/40 p-3 font-mono text-xs leading-relaxed text-jrpg-gold-bright">
            {text}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-4">
          <button
            onClick={copy}
            className="jrpg-btn jrpg-btn--ghost inline-flex items-center gap-1"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <ClipboardCopy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={download}
            className="jrpg-btn inline-flex items-center gap-1"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
