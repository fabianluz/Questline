"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Download } from "lucide-react";
import { encodeWav } from "@/lib/wav";

/**
 * Voice dictation (Phase 6) — record the mic, transcribe locally with
 * whisper.cpp, hand the text back via `onText`. Desktop-only: returns null when
 * there's no `window.questline` bridge (the web build has no local whisper).
 *
 * Mic audio (MediaRecorder, webm/opus) is decoded + resampled to 16 kHz mono in
 * the browser and wrapped as WAV (lib/wav.ts), so no native ffmpeg is needed —
 * the bytes go straight to whisper-cli in the Electron main process.
 */

type WhisperStatus = {
  state: "needs-binary" | "needs-model" | "ready";
  whisperBin: string | null;
  model: string | null;
};
type WhisperBridge = {
  whisperStatus: () => Promise<WhisperStatus>;
  whisperInstallModel: () => Promise<unknown>;
  transcribe: (wav: Uint8Array, lang?: string) => Promise<string>;
  onWhisperProgress: (
    cb: (p: { downloaded: number; total: number | null }) => void,
  ) => () => void;
};

function bridge(): WhisperBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { questline?: Partial<WhisperBridge> };
  return w.questline?.transcribe ? (w.questline as WhisperBridge) : null;
}

/** Decode mic audio → 16 kHz mono WAV bytes (no ffmpeg). */
async function blobToWav(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(buf);
  void ctx.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return encodeWav(rendered.getChannelData(0), rate);
}

export function DictateButton({
  onText,
  lang = "auto",
  className,
}: {
  onText: (text: string) => void;
  lang?: string;
  className?: string;
}) {
  const b = bridge();
  const [status, setStatus] = useState<WhisperStatus | null>(null);
  const [phase, setPhase] = useState<"idle" | "recording" | "transcribing" | "installing">("idle");
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!b) return;
    b.whisperStatus().then(setStatus).catch(() => setStatus(null));
    const off = b.onWhisperProgress((p) =>
      setPct(p.total ? Math.round((p.downloaded / p.total) * 100) : null),
    );
    return off;
  }, [b]);

  if (!b) return null;

  const cls =
    className ??
    "inline-flex items-center gap-1.5 rounded-md border border-trails-accent/40 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/10 disabled:opacity-50";

  // The binary can't be auto-installed — it's a one-time Homebrew step.
  if (status?.state === "needs-binary") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/40 px-2.5 py-1 text-[10px] uppercase tracking-widest text-trails-fg-dim"
        title="Enable voice input with: brew install whisper-cpp"
      >
        <Mic className="h-3 w-3" /> Voice needs whisper-cpp
      </span>
    );
  }

  if (status?.state === "needs-model") {
    return (
      <button
        type="button"
        disabled={phase === "installing"}
        onClick={async () => {
          setPhase("installing");
          setError(null);
          try {
            await b.whisperInstallModel();
            setStatus(await b.whisperStatus());
          } catch (e) {
            setError(e instanceof Error ? e.message : "Download failed");
          } finally {
            setPhase("idle");
            setPct(null);
          }
        }}
        className={cls}
        title="Download the on-device speech model (~148 MB)"
      >
        {phase === "installing" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {phase === "installing"
          ? pct !== null
            ? `Downloading… ${pct}%`
            : "Downloading…"
          : "Get voice model"}
      </button>
    );
  }

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const wav = await blobToWav(blob);
          const text = await b.transcribe(wav, lang);
          if (text) onText(text);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setPhase("idle");
        }
      };
      rec.start();
      recRef.current = rec;
      setPhase("recording");
    } catch {
      setError("Microphone access denied");
    }
  };
  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={phase === "transcribing"}
        onClick={phase === "recording" ? stop : start}
        className={cls}
        title={phase === "recording" ? "Stop and transcribe" : "Dictate with your voice"}
      >
        {phase === "transcribing" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : phase === "recording" ? (
          <Square className="h-3 w-3 text-trails-bad" />
        ) : (
          <Mic className="h-3 w-3" />
        )}
        {phase === "recording"
          ? "Stop"
          : phase === "transcribing"
            ? "Transcribing…"
            : "Dictate"}
      </button>
      {error && <span className="text-[10px] text-trails-bad">{error}</span>}
    </span>
  );
}
