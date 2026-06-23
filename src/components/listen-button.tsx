"use client";

import { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { speak, stopSpeaking, speechAvailable } from "@/lib/speech";

/**
 * "Listen" toggle (Phase 6) — reads `text` aloud via the local TTS engine
 * (macOS `say` in the desktop app, Web Speech on the web). Renders nothing if
 * no speech engine is available. A plain toggle: click to play, click to stop.
 */
export function ListenButton({
  text,
  label = "Listen",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // speechAvailable() touches window — resolve after mount to avoid hydration skew.
  useEffect(() => setAvailable(speechAvailable()), []);
  // Stop any speech if this control unmounts mid-utterance.
  useEffect(() => () => stopSpeaking(), []);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else {
          speak(text);
          setSpeaking(true);
        }
      }}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-trails-accent/40 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/10"
      }
      title={speaking ? "Stop reading" : "Read this aloud"}
    >
      {speaking ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      {speaking ? "Stop" : label}
    </button>
  );
}
