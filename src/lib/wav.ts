/**
 * Minimal 16-bit PCM mono WAV encoder for voice journaling (Phase 6 STT).
 *
 * whisper.cpp's `whisper-cli` wants a 16 kHz mono WAV. Arcadia extracted that
 * from a video with ffmpeg; here the audio comes straight from the mic
 * (MediaRecorder → WebAudio resample to 16 kHz mono Float32), so we just need
 * to wrap those samples in a WAV container — no native ffmpeg dependency.
 *
 * Pure + dependency-free so it's unit-tested; the recorder component resamples
 * and the Electron main process pipes the bytes to whisper-cli.
 */

const HEADER_BYTES = 44;

/** Encode mono Float32 samples (range −1..1) as a 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // file size minus the first 8 bytes
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let off = HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Uint8Array(buffer);
}

/** Read back the 4-char ASCII tag at a byte offset (test/debug helper). */
export function wavTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}
