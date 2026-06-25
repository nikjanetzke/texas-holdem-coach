// Tiny WAV synthesizer: builds short sound effects in-memory as data URIs so the
// app ships with no binary audio assets. Each effect is a small sequence of
// tones/noise envelopes mixed into a mono 16-bit PCM buffer.

interface Tone {
  freq: number;
  startMs: number;
  durMs: number;
  type?: 'sine' | 'triangle' | 'square' | 'noise';
  gain?: number;
}

function renderTones(tones: Tone[], totalMs: number, sampleRate = 22050): Float32Array {
  const totalSamples = Math.ceil((totalMs / 1000) * sampleRate);
  const buffer = new Float32Array(totalSamples);

  for (const tone of tones) {
    const startSample = Math.floor((tone.startMs / 1000) * sampleRate);
    const durSamples = Math.floor((tone.durMs / 1000) * sampleRate);
    const gain = tone.gain ?? 0.3;
    const type = tone.type ?? 'sine';
    for (let i = 0; i < durSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;
      const t = i / sampleRate;
      const envelope = Math.sin((Math.PI * i) / durSamples); // smooth in/out, avoids clicks
      let sample: number;
      if (type === 'noise') {
        sample = Math.random() * 2 - 1;
      } else if (type === 'square') {
        sample = Math.sign(Math.sin(2 * Math.PI * tone.freq * t));
      } else if (type === 'triangle') {
        const phase = (tone.freq * t) % 1;
        sample = 4 * Math.abs(phase - 0.5) - 1;
      } else {
        sample = Math.sin(2 * Math.PI * tone.freq * t);
      }
      buffer[idx] += sample * gain * envelope;
    }
  }

  // Normalize to avoid clipping if tones overlap.
  let max = 0;
  for (const v of buffer) max = Math.max(max, Math.abs(v));
  if (max > 1) for (let i = 0; i < buffer.length; i++) buffer[i] /= max;

  return buffer;
}

function floatToWavDataUri(samples: Float32Array, sampleRate = 22050): string {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function synthSfx(tones: Tone[], totalMs: number): string {
  return floatToWavDataUri(renderTones(tones, totalMs), 22050);
}
