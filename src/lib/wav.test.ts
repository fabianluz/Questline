import { describe, it, expect } from "vitest";
import { encodeWav, wavTag } from "./wav";

describe("encodeWav", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encodeWav(samples, 16000);

  it("writes the RIFF/WAVE/data chunk tags", () => {
    expect(wavTag(wav, 0)).toBe("RIFF");
    expect(wavTag(wav, 8)).toBe("WAVE");
    expect(wavTag(wav, 36)).toBe("data");
  });

  it("sizes the buffer as 44-byte header + 2 bytes per sample", () => {
    expect(wav.length).toBe(44 + samples.length * 2);
  });

  it("records the sample rate and 16-bit mono format in the header", () => {
    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it("clamps and converts samples to signed 16-bit PCM", () => {
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0); // 0.0
    expect(view.getInt16(44 + 6, true)).toBe(0x7fff); // +1.0 → max
    expect(view.getInt16(44 + 8, true)).toBe(-0x8000); // −1.0 → min
  });
});
