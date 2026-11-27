/**
 * Client-side audio helpers for Gemini Live API (16kHz PCM input / 24kHz PCM output)
 * and Gemini Audio Transcription (MediaRecorder -> base64).
 */

export function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Manual raw PCM decoding (24kHz, 16-bit little-endian mono) into an AudioBuffer.
 * Never use AudioContext.decodeAudioData on raw PCM streams.
 */
export function pcm24kBase64ToAudioBuffer(
  ctx: AudioContext,
  base64Pcm: string
): AudioBuffer {
  const binary = atob(base64Pcm);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const buffer = ctx.createBuffer(1, sampleCount, 24000);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = view.getInt16(i * 2, true) / 32768;
  }
  return buffer;
}

export function computeRmsLevel(float32: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < float32.length; i++) {
    sumSq += float32[i] * float32[i];
  }
  const rms = Math.sqrt(sumSq / Math.max(1, float32.length));
  return Math.min(1, rms * 4.5);
}

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/webm';
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read audio recording.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
