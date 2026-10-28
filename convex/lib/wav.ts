/**
 * PCM WAV helpers: the browser will import these too, so keep them free of
 * Node built-ins and network calls. The format accepted by Muse Voice
 * Transcribe is narrow (mono, 16-bit, 16 or 24 kHz, under 32 MB and
 * 10 minutes), and wavInfo enforces it before anything is uploaded.
 */

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_SECONDS = 10 * 60;
const ALLOWED_RATES = new Set([16_000, 24_000]);

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  seconds: number;
};

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

/**
 * Read a WAV header and return its audio properties. The file is scanned
 * chunk by chunk, so extra LIST or fact chunks before "data" are harmless.
 * Throws a plain-English error when the file is not a supported WAV.
 */
export function wavInfo(bytes: Uint8Array): WavInfo {
  if (!(bytes instanceof Uint8Array)) throw new Error("Not a valid WAV file.");
  if (bytes.length < 12) throw new Error("Not a valid WAV file.");
  if (readAscii(bytes, 0, 4) !== "RIFF") throw new Error("Not a valid WAV file.");
  if (readAscii(bytes, 8, 4) !== "WAVE") throw new Error("Not a valid WAV file.");
  if (bytes.length > MAX_BYTES) throw new Error(`WAV file exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let fmtFound = false;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataSize = -1;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + size + (size % 2);

    if (dataOffset + size > bytes.length) {
      // A declared chunk runs past the end of the file.
      throw new Error("WAV file is truncated.");
    }

    if (id === "fmt ") {
      if (size < 16) throw new Error("WAV file has an invalid fmt chunk.");
      audioFormat = view.getUint16(dataOffset, true);
      channels = view.getUint16(dataOffset + 2, true);
      sampleRate = view.getUint32(dataOffset + 4, true);
      bitsPerSample = view.getUint16(dataOffset + 14, true);
      fmtFound = true;
    } else if (id === "data") {
      dataSize = size;
      // A WAV has one data chunk, and it is the audio; nothing after it matters.
      break;
    }

    offset = nextOffset;
  }

  if (!fmtFound) throw new Error("WAV file is missing its fmt chunk.");
  if (dataSize === -1) throw new Error("WAV file is missing its data chunk.");
  if (audioFormat !== 1) throw new Error("Only PCM WAV files are supported.");
  if (channels !== 1) throw new Error("Only mono WAV files are supported.");
  if (bitsPerSample !== 16) throw new Error("Only 16-bit WAV files are supported.");
  if (!ALLOWED_RATES.has(sampleRate)) {
    throw new Error("WAV sample rate must be 16 kHz or 24 kHz.");
  }

  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate * channels * bytesPerSample;
  const seconds = dataSize / byteRate;

  if (seconds > MAX_SECONDS) throw new Error("WAV audio exceeds 10 minute limit.");
  // The API refuses a body over 32 MB, whatever the header says the audio is.
  if (bytes.length > MAX_BYTES) throw new Error(`WAV file exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`);

  return { sampleRate, channels, bitsPerSample, seconds };
}

/**
 * Turn decoded channel data into a mono 16-bit WAV at the target rate.
 * Channels are mixed by averaging, then linearly resampled if needed,
 * clamped to [-1, 1] and written as little-endian PCM.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  targetRate: 16_000 | 24_000 = 24_000,
): Uint8Array {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("At least one channel is required.");
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Sample rate must be a positive number.");
  }
  if (targetRate !== 16_000 && targetRate !== 24_000) {
    throw new Error("Target rate must be 16 kHz or 24 kHz.");
  }

  const length = channels[0].length;
  for (const ch of channels) {
    if (!(ch instanceof Float32Array)) throw new Error("Each channel must be a Float32Array.");
  }
  // If channels differ in length, average only the common prefix; extra
  // samples in longer channels are ignored, matching Web Audio's behaviour
  // when merging.
  const monoLength = length;

  const mono = new Float32Array(monoLength);
  for (let i = 0; i < monoLength; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) {
      sum += i < channels[c].length ? channels[c][i] : 0;
    }
    mono[i] = sum / channels.length;
  }

  let out: Float32Array;
  if (sampleRate === targetRate) {
    out = mono;
  } else {
    const destLen = Math.round((mono.length * targetRate) / sampleRate);
    if (destLen === 0) throw new Error("Resampling produced no samples.");
    out = new Float32Array(destLen);
    const ratio = sampleRate / targetRate;
    for (let i = 0; i < destLen; i++) {
      const srcPos = i * ratio;
      const lo = Math.floor(srcPos);
      const hi = Math.min(lo + 1, mono.length - 1);
      const frac = srcPos - lo;
      // Linear interpolation is adequate for speech; silence the tail
      // when the source is exhausted.
      if (lo >= mono.length) {
        out[i] = 0;
      } else {
        out[i] = mono[lo] * (1 - frac) + mono[hi] * frac;
      }
    }
  }

  const seconds = out.length / targetRate;
  if (seconds > MAX_SECONDS) throw new Error("Encoded WAV would exceed 10 minute limit.");

  const dataSize = out.length * 2; // 16-bit mono
  const totalSize = 44 + dataSize;
  if (totalSize > MAX_BYTES) throw new Error(`Encoded WAV would exceed ${MAX_BYTES / (1024 * 1024)} MB limit.`);

  const wav = new Uint8Array(totalSize);
  const view = new DataView(wav.buffer);

  // RIFF header
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, totalSize - 8, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  // fmt chunk
  wav.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits
  // data chunk
  wav.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < out.length; i++) {
    let s = out[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    // Map [-1, 1] to [-32768, 32767]
    const int16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    const clamped = Math.max(-32768, Math.min(32767, int16));
    view.setInt16(offset, clamped, true);
    offset += 2;
  }

  return wav;
}
