"use client";

import Link from "next/link";
import { ChevronLeft, Cpu } from "lucide-react";

/**
 * /ai/* — Local AI pipeline shell.
 *
 * Each step page renders inside this layout. Layout owns:
 *   - the back-to-dashboard breadcrumb
 *   - the page-level header with the local-AI promise
 *
 * The 4-step indicator (<AiStepper />) lives inside each page so the
 * `current` step can stay accurate without prop drilling through the
 * layout.
 */
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-trails-fg-dim hover:text-trails-accent"
      >
        <ChevronLeft className="h-3 w-3" /> Dashboard
      </Link>

      <header className="space-y-1">
        <h1 className="flex items-center gap-2">
          <Cpu className="h-6 w-6 text-trails-accent" />
          AI · Notes → App
        </h1>
        <p className="max-w-3xl text-sm text-trails-fg-dim">
          Take your raw life-goal notes, restructure them into Questline
          vocabulary, convert to JSON, review, commit. Every LLM run is local
          via Ollama — your notes never leave this Mac.
        </p>
      </header>

      {children}
    </div>
  );
}
