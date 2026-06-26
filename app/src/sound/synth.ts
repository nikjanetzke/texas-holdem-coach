// Tiny WAV synthesizer: builds short, ADSR-shaped sound effects in-memory as
// data URIs so the app ships with no binary audio assets. Each effect is a
// small set of tones/filtered-noise hits mixed into a mono 16-bit PCM buffer.

interface Tone {
  freq: number;
  startMs: number;
  durMs: number;
  type?: 'sine' | 'triangle' | 'square' | 'noise';
  gain?: number;
  /** Extra overtone mix (0-1) for a richer, less "beepy" tone. Sine/triangle only. */
  overtone?: number;
  /** Lowpass smoothing amount for noise (0 = harsh static, 1 = dull thud). */
  smooth?: number;
  /** Pitch glide target — if set, freq sweeps from `freq` to this over durMs. */
  glideTo?: number;
}

function envelopeAt(i: number, durSamples: number, attackSamples: number): number {
  if (i < attackSamples) return i / attackSamples;
  const t = (i - attackSamples) / (durSamples - attackSamples || 1);
  return Math.exp(-t * 4.5); // exponential decay tail, avoids the "synth beep" sine-window sound
}

function renderTones(tones: Tone[], totalMs: number, sampleRate = 44100): Float32Array {
  const totalSamples = Math.ceil((totalMs / 1000) * sampleRate);
  const buffer = new Float32Array(totalSamples);

  for (const tone of tones) {
    const startSample = Math.floor((tone.startMs / 1000) * sampleRate);
    const durSamples = Math.floor((tone.durMs / 1000) * sampleRate);
    const attackSamples = Math.max(1, Math.min(durSamples * 0.15, sampleRate * 0.006));
    const gain = tone.gain ?? 0.3;
    const type = tone.type ?? 'sine';
    const overtone = tone.overtone ?? 0;
    let prevNoise = 0;

    for (let i = 0; i < durSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;
      const t = i / sampleRate;
      const env = envelopeAt(i, durSamples, attackSamples);
      let sample: number;

      if (type === 'noise') {
        const raw = Math.random() * 2 - 1;
        const smooth = tone.smooth ?? 0.6;
        prevNoise = prevNoise * smooth + raw * (1 - smooth);
        sample = prevNoise;
      } else {
        const freq = tone.glideTo ? tone.freq + (tone.glideTo - tone.freq) * (i / durSamples) : tone.freq;
        if (type === 'square') {
          sample = Math.sign(Math.sin(2 * Math.PI * freq * t));
        } else if (type === 'triangle') {
          const phase = (freq * t) % 1;
          sample = 4 * Math.abs(phase - 0.5) - 1;
        } else {
          sample = Math.sin(2 * Math.PI * freq * t);
          if (overtone > 0) sample += overtone * Math.sin(2 * Math.PI * freq * 2 * t);
          if (overtone > 0) sample /= 1 + overtone;
        }
      }
      buffer[idx] += sample * gain * env;
    }
  }

  let max = 0;
  for (const v of buffer) max = Math.max(max, Math.abs(v));
  if (max > 1) for (let i = 0; i < buffer.length; i++) buffer[i] /= max;

  return buffer;
}

function floatToWavDataUri(samples: Float32Array, sampleRate: number): string {
  const bytesPerSample = 2;
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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
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
  const sampleRate = 44100;
  return floatToWavDataUri(renderTones(tones, totalMs, sampleRate), sampleRate);
}
