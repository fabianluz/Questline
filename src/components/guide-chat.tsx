"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokensPerSecond } from "@/lib/model-routing";

/** Open the Guide chat from anywhere. */
export function openGuideChat() {
  window.dispatchEvent(new Event("questline:guide"));
}

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "What should I focus on this week?",
  "Am I behind on anything?",
  "Plan my next 3 days.",
  "What's the fastest way to clear my debt?",
];

/**
 * "Ask the Guide" — a slide-over chat that streams answers from the local model,
 * grounded in your roadmap. Opens on the ⌘-bar button / openGuideChat().
 */
export function GuideChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lastRun, setLastRun] = useState<{ model: string; tps: number | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("questline:guide", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("questline:guide", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/ai/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "token") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: copy[copy.length - 1].content + evt.text,
              };
              return copy;
            });
          } else if (evt.type === "done") {
            setLastRun({
              model: evt.model,
              tps: tokensPerSecond(evt.responseTokens, evt.durationMs),
            });
          } else if (evt.type === "error") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: `⚠️ ${evt.message}`,
              };
              return copy;
            });
          }
        }
      }
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : String(err)}`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[92] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l-2 border-jrpg-gold/50 bg-trails-panel/98 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ask the Guide"
      >
        <div className="flex items-center justify-between border-b border-jrpg-gold/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-jrpg-gold" />
            <div className="flex flex-col">
              <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
                Ask the Guide
              </h2>
              {lastRun && (
                <span className="font-mono text-[9px] text-trails-fg-dim">
                  {lastRun.model}
                  {lastRun.tps ? ` · ${lastRun.tps.toFixed(1)} tok/s` : ""}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-trails-fg-dim hover:text-trails-fg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-trails-fg-dim">
                Ask anything about your roadmap, finances, or week. Answers come
                from your own data, generated locally.
              </p>
              <div className="flex flex-col gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-md border border-trails-trim/50 px-3 py-1.5 text-left text-xs text-trails-fg hover:border-trails-accent/60 hover:text-trails-accent"
                  >
                    <Sparkles className="mr-1.5 inline h-3 w-3 text-jrpg-gold" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-trails-accent/20 text-trails-fg"
                    : "mr-auto bg-trails-panel-dark/70 text-trails-fg",
                )}
              >
                <p className="whitespace-pre-wrap">
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </p>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-jrpg-gold/40 p-3"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={streaming ? "The Guide is thinking…" : "Ask the Guide…"}
            disabled={streaming}
            className="min-w-0 flex-1 rounded-md border border-trails-trim/50 bg-trails-panel-dark px-3 py-2 text-sm text-trails-fg focus:outline-none focus:ring-1 focus:ring-trails-accent/50 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-md border border-trails-accent/60 bg-trails-accent/10 p-2 text-trails-accent disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
