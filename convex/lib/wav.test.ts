import { describe, expect, it } from "vitest";
import { encodeWav, wavInfo } from "./wav";

/** Build a minimal PCM WAV from raw bytes for header-edge cases. */
function makeWav(opts: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format?: number;
  seconds?: number;
  withList?: boolean;
}): Uint8Array {
  const format = opts.format ?? 1;
  const seconds = opts.seconds ?? 0.01;
  const byteRate = opts.sampleRate * opts.channels * (opts.bitsPerSample / 8);
  const dataSize = Math.floor(byteRate * seconds);
  const fmtSize = 16;

  // Extra LIST chunk
  const listPayload = new TextEncoder().encode("CMNT");
  const listSize = opts.withList ? 4 + listPayload.length : 0;
  // LIST chunk: id 4 + size 4 + payload + pad if odd
  const listTotal = opts.withList ? 8 + listSize + (listSize % 2) : 0;

  const total = 12 + 8 + fmtSize + listTotal + 8 + dataSize;
  const wav = new Uint8Array(total);
  const view = new DataView(wav.buffer);

  wav.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, total - 8, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE

  // fmt chunk
  let off = 12;
  wav.set([0x66, 0x6d, 0x74, 0x20], off); // fmt
  off += 4;
  view.setUint32(off, fmtSize, true);
  off += 4;
  view.setUint16(off, format, true);
  off += 2;
  view.setUint16(off, opts.channels, true);
  off += 2;
  view.setUint32(off, opts.sampleRate, true);
  off += 4;
  view.setUint32(off, byteRate, true);
  off += 4;
  view.setUint16(off, opts.channels * (opts.bitsPerSample / 8), true);
  off += 2;
  view.setUint16(off, opts.bitsPerSample, true);
  off += 2;

  if (opts.withList) {
    wav.set([0x4c, 0x49, 0x53, 0x54], off); // LIST
    off += 4;
    view.setUint32(off, listSize, true);
    off += 4;
    wav.set(listPayload, off);
    off += listPayload.length;
    wav.set([0x00, 0x00, 0x00, 0x00].slice(0, listSize - listPayload.length), off);
    // simpler: we put 4 bytes type; already accounted
    // For our test, put "INFO" as type plus payload
    // Re-do correctly: LIST size includes the type; let's just fill zeros for extra
    if (listSize % 2 === 1) off += 1;
  }

  // data chunk
  wav.set([0x64, 0x61, 0x74, 0x61], off); // data
  off += 4;
  view.setUint32(off, dataSize, true);
  off += 4;
  // data bytes already zero
  return wav;
}

// A compact LIST builder that is correctly formed for the walking test.
function makeWavWithList(sampleRate: number): Uint8Array {
  const seconds = 0.05;
  const channels = 1;
  const bits = 16;
  const dataSize = Math.floor(sampleRate * channels * (bits / 8) * seconds);
  const fmtSize = 16;
  // LIST chunk with type "INFO" and no extra sub-chunks
  const listData = new TextEncoder().encode("INFO");
  const listSize = listData.length; // 4
  const wavSize = 12 + 8 + fmtSize + 8 + listSize + 8 + dataSize;
  const wav = new Uint8Array(wavSize);
  const view = new DataView(wav.buffer);
  wav.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, wavSize - 8, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8);
  let off = 12;
  wav.set([0x66, 0x6d, 0x74, 0x20], off);
  off += 4;
  view.setUint32(off, fmtSize, true);
  off += 4;
  view.setUint16(off, 1, true);
  off += 2;
  view.setUint16(off, 1, true);
  off += 2;
  view.setUint32(off, sampleRate, true);
  off += 4;
  view.setUint32(off, sampleRate * 2, true);
  off += 4;
  view.setUint16(off, 2, true);
  off += 2;
  view.setUint16(off, 16, true);
  off += 2;
  // LIST
  wav.set([0x4c, 0x49, 0x53, 0x54], off);
  off += 4;
  view.setUint32(off, listSize, true);
  off += 4;
  wav.set(listData, off);
  off += listData.length;
  // data
  wav.set([0x64, 0x61, 0x74, 0x61], off);
  off += 4;
  view.setUint32(off, dataSize, true);
  return wav;
}

describe("wavInfo", () => {
  it("reads a valid 16 kHz mono file", () => {
    const wav = makeWav({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, seconds: 0.1 });
    const info = wavInfo(wav);
    expect(info.sampleRate).toBe(16_000);
    expect(info.channels).toBe(1);
    expect(info.bitsPerSample).toBe(16);
    expect(info.seconds).toBeCloseTo(0.1, 3);
  });

  it("reads a valid 24 kHz mono file", () => {
    const wav = makeWav({ sampleRate: 24_000, channels: 1, bitsPerSample: 16, seconds: 0.2 });
    const info = wavInfo(wav);
    expect(info.sampleRate).toBe(24_000);
    expect(info.seconds).toBeCloseTo(0.2, 3);
  });

  it("skips a LIST chunk before data", () => {
    const wav = makeWavWithList(16_000);
    const info = wavInfo(wav);
    expect(info.sampleRate).toBe(16_000);
    expect(info.seconds).toBeGreaterThan(0);
  });

  it("refuses stereo", () => {
    const wav = makeWav({ sampleRate: 16_000, channels: 2, bitsPerSample: 16 });
    expect(() => wavInfo(wav)).toThrow(/mono/i);
  });

  it("refuses 8-bit", () => {
    const wav = makeWav({ sampleRate: 16_000, channels: 1, bitsPerSample: 8 });
    expect(() => wavInfo(wav)).toThrow(/16-bit/i);
  });

  it("refuses 44.1 kHz", () => {
    const wav = makeWav({ sampleRate: 44_100, channels: 1, bitsPerSample: 16 });
    expect(() => wavInfo(wav)).toThrow(/16 kHz or 24 kHz/i);
  });

  it("refuses non-PCM", () => {
    const wav = makeWav({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, format: 3 });
    expect(() => wavInfo(wav)).toThrow(/PCM/i);
  });

  it("refuses audio over 10 minutes", () => {
    const wav = makeWav({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, seconds: 601 });
    expect(() => wavInfo(wav)).toThrow(/10 minute/i);
  });

  it("refuses a truncated header", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00]);
    expect(() => wavInfo(wav)).toThrow(/Not a valid WAV/i);
  });

  it("refuses a non-WAV file", () => {
    const wav = new TextEncoder().encode("not a wav file at all!!");
    expect(() => wavInfo(wav)).toThrow(/Not a valid WAV/i);
  });
});

describe("encodeWav", () => {
  it("resamples 48 kHz stereo to 24 kHz mono and passes wavInfo", () => {
    const len = 4800; // 0.1 s at 48 kHz
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const s = Math.sin((2 * Math.PI * 440 * i) / 48_000);
      left[i] = s;
      right[i] = s;
    }
    const wav = encodeWav([left, right], 48_000, 24_000);
    const info = wavInfo(wav);
    expect(info.sampleRate).toBe(24_000);
    expect(info.channels).toBe(1);
    expect(info.seconds).toBeCloseTo(0.1, 2);
  });

  it("copies 16 kHz mono sample for sample when the target matches", () => {
    const ch = new Float32Array([0, 0.5, -0.5, 0.25]);
    const wav = encodeWav([ch], 16_000, 16_000);
    const info = wavInfo(wav);
    expect(info.seconds).toBeCloseTo(ch.length / 16_000, 5);
    // Read back samples and compare
    const view = new DataView(wav.buffer, wav.byteOffset);
    const read = [];
    for (let i = 0; i < ch.length; i++) {
      const v = view.getInt16(44 + i * 2, true);
      read.push(v / (v < 0 ? 32768 : 32767));
    }
    for (let i = 0; i < ch.length; i++) {
      expect(read[i]).toBeCloseTo(ch[i], 2);
    }
  });

  it("clamps values outside [-1, 1]", () => {
    const ch = new Float32Array([2, -2, 1.5, -1.5]);
    const wav = encodeWav([ch], 16_000, 16_000);
    const view = new DataView(wav.buffer, wav.byteOffset);
    const vals = [];
    for (let i = 0; i < ch.length; i++) vals.push(view.getInt16(44 + i * 2, true));
    expect(vals[0]).toBe(32767);
    expect(vals[1]).toBe(-32768);
    expect(vals[2]).toBe(32767);
    expect(vals[3]).toBe(-32768);
  });

  it("throws when the encoded audio would exceed 10 minutes", () => {
    const len = 16_000 * 601; // 601 s at 16 kHz
    const ch = new Float32Array(len);
    expect(() => encodeWav([ch], 16_000, 16_000)).toThrow(/10 minute/i);
  });
});
