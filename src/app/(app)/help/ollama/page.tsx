"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  Copy,
  Cpu,
  ExternalLink,
  Terminal,
} from "lucide-react";

/**
 * /help/ollama
 *
 * The full local-LLM setup guide, in-app. Reached from the dashboard
 * <OllamaStatusCard /> when the user wants more than the three-step quick
 * start. Includes troubleshooting + model alternatives + privacy note.
 */
export default function OllamaHelpPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
      >
        <ChevronLeft className="h-3 w-3" /> Dashboard
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Cpu className="h-6 w-6 text-indigo-500" />
          Set up Ollama (the local LLM)
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Questline runs 100% locally — no cloud calls, no API keys. The AI
          Guide (epic break-down, schedule advice, resource recommendations,
          side-quest generator, weekly retrospective drafts) talks to{" "}
          <a
            href="https://ollama.com"
            className="underline"
            target="_blank"
            rel="noopener"
          >
            Ollama
          </a>{" "}
          running on this Mac. The rest of the app works without it.
        </p>
      </header>

      <Section title="1. Install Ollama" icon={<Terminal />}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          On macOS, the easiest path is Homebrew:
        </p>
        <Cmd cmd="brew install ollama" />
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Or download the menu-bar app from{" "}
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-0.5 underline"
          >
            ollama.com/download <ExternalLink className="h-3 w-3" />
          </a>{" "}
          — the menu-bar version auto-starts on login, which is convenient.
        </p>
      </Section>

      <Section title="2. Start the daemon" icon={<Terminal />}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          If you installed the menu-bar app, it's already running (look for the
          llama icon in your menu bar). Otherwise:
        </p>
        <Cmd cmd="ollama serve" />
        <p className="text-xs text-zinc-500">
          The daemon listens on <code className="font-mono">localhost:11434</code>{" "}
          — that's the address Questline talks to.
        </p>
      </Section>

      <Section title="3. Pull a model" icon={<Cpu />}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          The default model is <code className="font-mono">qwen2.5:14b</code>{" "}
          (~9 GB). It has excellent tool-calling and JSON fidelity — what the
          AI Guide and the Chapter Board planner need for structured output —
          and runs comfortably on 24 GB Apple Silicon.
        </p>
        <Cmd cmd="ollama pull qwen2.5:14b" />
        <details className="rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">
            Use a different model
          </summary>
          <div className="mt-2 space-y-2 text-zinc-600 dark:text-zinc-400">
            <p>
              Any Ollama model that supports tool-calling will work. Verified
              alternatives:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <code className="font-mono">qwen2.5:7b</code> — lighter, ~4.7
                GB, the better pick if you&apos;re tight on RAM. Still strong
                at tool-calling.
              </li>
              <li>
                <code className="font-mono">qwen2.5:32b</code> — sharper, ~18
                GB. Fits 24 GB but leaves little headroom; first-token latency
                is higher.
              </li>
              <li>
                <code className="font-mono">llama3.1:8b</code> — solid, ~4.7
                GB, alternative if Qwen feels too verbose
              </li>
            </ul>
            <p>
              Set <code className="font-mono">OLLAMA_MODEL=&lt;name&gt;</code>{" "}
              in <code className="font-mono">.env.local</code> and restart the
              Next dev server.
            </p>
            <p>
              Smaller models (under 7B) often fail to emit valid tool calls —
              the AI Guide will return zero proposals. If you want to try one
              anyway, expect to iterate on the prompt.
            </p>
          </div>
        </details>
      </Section>

      <Section title="4. Verify it's wired up" icon={<Check />}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Go back to{" "}
          <Link href="/dashboard" className="underline">
            the dashboard
          </Link>{" "}
          and find the <strong>AI Guide · Ollama</strong> card. It should turn
          green ("ready"). Or hit the endpoint directly:
        </p>
        <Cmd cmd="curl -s http://localhost:3000/api/ollama/status | jq" />
        <p className="text-xs text-zinc-500">
          Expected:{" "}
          <code className="font-mono">
            {"{ reachable: true, modelInstalled: true, ... }"}
          </code>
        </p>
      </Section>

      <Section title="Troubleshooting" icon={<Terminal />}>
        <Tip
          q="Connection refused / ECONNREFUSED"
          a="Ollama daemon isn't running. Run `ollama serve` in a terminal, or open the menu-bar app."
        />
        <Tip
          q="Model not found / 404 from Ollama"
          a="The model name in your .env.local doesn't match anything you've pulled. Run `ollama list` to see installed models, then pull what's missing."
        />
        <Tip
          q="AI Guide returns zero proposals"
          a="The model didn't emit a valid tool call. Most common with sub-7B models. Either pull the default qwen2.5:14b or try a different temperature (in lib/advisor.ts, the `options.temperature` parameter — try 0.4 or 0.8)."
        />
        <Tip
          q="Ollama is slow"
          a="First-token latency depends on model size and whether the GPU is warm. qwen2.5:14b warms up in a few seconds on an M4 Pro; sustained generation is comfortable on 24 GB. If it feels slow, drop to qwen2.5:7b or reduce streaming chunk size."
        />
        <Tip
          q="I want to point at Ollama on another machine"
          a="Set OLLAMA_BASE_URL=http://that-machine.local:11434 in .env.local. The app will keep working — only the AI Guide call site differs."
        />
      </Section>

      <Section title="Privacy note" icon={<Check />}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Every byte of data Questline sees stays on this Mac:
        </p>
        <ul className="ml-5 list-disc text-sm text-zinc-700 dark:text-zinc-300">
          <li>Postgres in OrbStack (local Docker)</li>
          <li>Ollama daemon (local process)</li>
          <li>Next dev server (local process)</li>
        </ul>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          No outgoing network requests are made by the app to anyone but
          localhost. If you ever see one in DevTools, that's a bug — please
          file it.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-zinc-500">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Cmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md bg-zinc-900/5 p-2 dark:bg-zinc-50/5">
      <code className="flex-1 overflow-x-auto font-mono text-xs">{cmd}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

function Tip({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <summary className="cursor-pointer text-sm font-medium">{q}</summary>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{a}</p>
    </details>
  );
}
