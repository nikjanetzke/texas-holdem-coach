import { Howl } from 'howler';
import { synthSfx } from './synth';

export type SfxName = 'deal' | 'flip' | 'check' | 'bet' | 'call' | 'fold' | 'allin' | 'win' | 'click';

// A single "chip clink": a tight metallic ping (high sine + overtone) layered
// over a soft felt thud (smoothed noise), which is what actually reads as
// a casino chip rather than a synth beep.
function chipClink(startMs: number, pitch = 1): Tone[] {
  return [
    { freq: 1800 * pitch, startMs, durMs: 70, type: 'sine', gain: 0.16, overtone: 0.5 },
    { freq: 2600 * pitch, startMs: startMs + 4, durMs: 50, type: 'sine', gain: 0.08, overtone: 0.3 },
    { freq: 180, startMs, durMs: 35, type: 'noise', smooth: 0.75, gain: 0.1 },
  ];
}

type Tone = Parameters<typeof synthSfx>[0][number];

const DEFS: Record<SfxName, () => string> = {
  deal: () =>
    synthSfx(
      [
        { freq: 2200, startMs: 0, durMs: 28, type: 'noise', smooth: 0.45, gain: 0.18 },
        { freq: 1400, startMs: 4, durMs: 20, type: 'sine', gain: 0.1 },
      ],
      45,
    ),
  flip: () =>
    synthSfx(
      [
        { freq: 2600, startMs: 0, durMs: 22, type: 'noise', smooth: 0.5, gain: 0.16 },
        { freq: 1900, startMs: 2, durMs: 18, type: 'sine', gain: 0.12 },
      ],
      35,
    ),
  check: () =>
    synthSfx(
      [
        { freq: 140, startMs: 0, durMs: 50, type: 'noise', smooth: 0.82, gain: 0.22 },
        { freq: 90, startMs: 0, durMs: 60, type: 'sine', gain: 0.12 },
        { freq: 140, startMs: 130, durMs: 50, type: 'noise', smooth: 0.82, gain: 0.22 },
        { freq: 90, startMs: 130, durMs: 60, type: 'sine', gain: 0.12 },
      ],
      220,
    ),
  bet: () => synthSfx([...chipClink(0), ...chipClink(50, 1.08), ...chipClink(95, 0.96)], 180),
  call: () => synthSfx([...chipClink(0), ...chipClink(55, 1.05)], 140),
  fold: () =>
    synthSfx(
      [
        { freq: 900, glideTo: 220, startMs: 0, durMs: 160, type: 'noise', smooth: 0.7, gain: 0.16 },
        { freq: 260, startMs: 10, durMs: 120, type: 'triangle', gain: 0.07 },
      ],
      200,
    ),
  allin: () =>
    synthSfx(
      [
        ...chipClink(0),
        ...chipClink(60, 1.05),
        ...chipClink(120, 1.1),
        ...chipClink(180, 1.18),
        ...chipClink(245, 1.28),
        { freq: 110, startMs: 0, durMs: 380, type: 'sine', gain: 0.14, overtone: 0.6 },
      ],
      420,
    ),
  win: () =>
    synthSfx(
      [
        { freq: 523.25, startMs: 0, durMs: 180, type: 'sine', gain: 0.2, overtone: 0.35 },
        { freq: 659.25, startMs: 90, durMs: 180, type: 'sine', gain: 0.2, overtone: 0.35 },
        { freq: 784.0, startMs: 180, durMs: 220, type: 'sine', gain: 0.22, overtone: 0.35 },
        { freq: 1046.5, startMs: 270, durMs: 380, type: 'sine', gain: 0.2, overtone: 0.4 },
        ...chipClink(0, 1.3),
        ...chipClink(90, 1.4),
        ...chipClink(180, 1.5),
      ],
      650,
    ),
  click: () => synthSfx([{ freq: 1100, startMs: 0, durMs: 16, type: 'sine', gain: 0.12 }], 25),
};

class SoundManager {
  private howls = new Map<SfxName, Howl>();
  private _muted = false;

  private get(name: SfxName): Howl {
    let howl = this.howls.get(name);
    if (!howl) {
      // Prefer a real recorded sample at /sounds/<name>.mp3; if it isn't present
      // (404 / decode error), transparently fall back to the synthesized sound.
      // Drop files into app/public/sounds/ to upgrade the audio with no code change.
      howl = new Howl({
        src: [`/sounds/${name}.mp3`],
        format: ['mp3'],
        onloaderror: () => {
          this.howls.set(name, new Howl({ src: [DEFS[name]()], format: ['wav'] }));
        },
      });
      this.howls.set(name, howl);
    }
    return howl;
  }

  play(name: SfxName) {
    if (this._muted) return;
    this.get(name).play();
  }

  get muted() {
    return this._muted;
  }

  setMuted(muted: boolean) {
    this._muted = muted;
  }
}

export const soundManager = new SoundManager();
