import { Howl } from 'howler';
import { synthSfx } from './synth';

export type SfxName = 'deal' | 'flip' | 'check' | 'bet' | 'call' | 'fold' | 'allin' | 'win' | 'click';

const DEFS: Record<SfxName, () => string> = {
  deal: () => synthSfx([{ freq: 1200, startMs: 0, durMs: 45, type: 'triangle', gain: 0.25 }], 60),
  flip: () => synthSfx([{ freq: 1800, startMs: 0, durMs: 30, type: 'triangle', gain: 0.2 }], 40),
  check: () =>
    synthSfx(
      [
        { freq: 220, startMs: 0, durMs: 60, type: 'square', gain: 0.18 },
        { freq: 220, startMs: 80, durMs: 60, type: 'square', gain: 0.18 },
      ],
      150,
    ),
  bet: () =>
    synthSfx(
      [
        { freq: 320, startMs: 0, durMs: 40, type: 'noise', gain: 0.12 },
        { freq: 520, startMs: 0, durMs: 90, type: 'sine', gain: 0.2 },
        { freq: 660, startMs: 40, durMs: 80, type: 'sine', gain: 0.15 },
      ],
      150,
    ),
  call: () =>
    synthSfx(
      [
        { freq: 280, startMs: 0, durMs: 40, type: 'noise', gain: 0.12 },
        { freq: 440, startMs: 0, durMs: 90, type: 'sine', gain: 0.2 },
      ],
      120,
    ),
  fold: () => synthSfx([{ freq: 180, startMs: 0, durMs: 140, type: 'triangle', gain: 0.15 }], 160),
  allin: () =>
    synthSfx(
      [
        { freq: 440, startMs: 0, durMs: 100, type: 'sine', gain: 0.2 },
        { freq: 550, startMs: 80, durMs: 100, type: 'sine', gain: 0.22 },
        { freq: 660, startMs: 160, durMs: 140, type: 'sine', gain: 0.25 },
      ],
      320,
    ),
  win: () =>
    synthSfx(
      [
        { freq: 523, startMs: 0, durMs: 120, type: 'sine', gain: 0.22 },
        { freq: 659, startMs: 110, durMs: 120, type: 'sine', gain: 0.22 },
        { freq: 784, startMs: 220, durMs: 220, type: 'sine', gain: 0.25 },
      ],
      460,
    ),
  click: () => synthSfx([{ freq: 900, startMs: 0, durMs: 20, type: 'sine', gain: 0.15 }], 30),
};

class SoundManager {
  private howls = new Map<SfxName, Howl>();
  private _muted = false;

  private get(name: SfxName): Howl {
    let howl = this.howls.get(name);
    if (!howl) {
      howl = new Howl({ src: [DEFS[name]()], format: ['wav'] });
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
