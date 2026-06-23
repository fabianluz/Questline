/**
 * Text-to-speech helper (Phase 6). In the desktop app it speaks via the Electron
 * bridge → macOS `say` (offline, natural voices, no bundling). On the web build
 * it falls back to the browser's Web Speech API. Strips light Markdown so the
 * coach's `**bold**`/bullets aren't read out as "asterisk asterisk".
 */

type SpeakBridge = {
  speak: (text: string, opts?: { voice?: string; rate?: number }) => Promise<unknown>;
  stopSpeaking: () => Promise<unknown>;
};

function bridge(): SpeakBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { questline?: Partial<SpeakBridge> };
  return w.questline?.speak ? (w.questline as SpeakBridge) : null;
}

/** Whether any TTS path is available (native bridge or browser synthesis). */
export function speechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!bridge() || "speechSynthesis" in window;
}

/** Flatten Markdown to clean prose for the speech engine. */
export function toSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // drop code/diagram fences entirely
    .replace(/[*_`#>]/g, "") // bold/italic/code/heading/quote markers
    .replace(/^\s*[-•]\s*/gm, "") // bullet glyphs
    .replace(/\$\$?([^$]+)\$\$?/g, "$1") // unwrap LaTeX delimiters
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string): void {
  const clean = toSpeech(text);
  if (!clean) return;
  const b = bridge();
  if (b) {
    void b.speak(clean);
    return;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
  }
}

export function stopSpeaking(): void {
  const b = bridge();
  if (b) {
    void b.stopSpeaking();
    return;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
