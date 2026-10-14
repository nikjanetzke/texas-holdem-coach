import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine/deck';
import { HandRank, evaluateBestHand } from '../../engine/evaluator';
import {
  boardTexture,
  correctSizes,
  generateSizingQuestion,
  priceForCaller,
  sizingNote,
} from '../sizingDrill';
import { buildSessionReport, type SessionData } from '../sessionReport';
import { SEAT_BOX_W, seatPosition, seatScaleFor } from '../../pixi/seatLayout';

const C = (s: string): Card => ({ rank: s.slice(0, -1) as Card['rank'], suit: s.slice(-1) as Card['suit'] });
const B = (...xs: string[]) => xs.map(C);

describe('bet sizing', () => {
  it('prices: what a caller needs to win for each bet size', () => {
    expect(priceForCaller(1 / 3)).toBeCloseTo(20, 5);
    expect(priceForCaller(1 / 2)).toBeCloseTo(25, 5);
    expect(priceForCaller(3 / 4)).toBeCloseTo(30, 5);
    expect(priceForCaller(1)).toBeCloseTo(33.33, 1);
  });

  it('classifies textbook boards', () => {
    expect(boardTexture(B('9h', '8h', '2c'))).toBe('wet'); // flush draw + connected
    expect(boardTexture(B('Ks', '7d', '2c'))).toBe('dry'); // rainbow, spread out
    expect(boardTexture(B('Kh', '7h', '2c'))).toBe('mixed'); // flush draw but not connected
    expect(boardTexture(B('9s', '8d', '2c'))).toBe('mixed'); // connected but rainbow
    expect(boardTexture(B('Ah', 'Kh', 'Qh'))).toBe('mixed'); // flush already possible — not a "draw" spot
    expect(boardTexture(B('Ad', '2s', '9c'))).toBe('mixed'); // ace plays low: A-2 is connected
  });

  it('every generated question is what it claims', () => {
    for (let i = 0; i < 400; i++) {
      const q = generateSizingQuestion();
      expect(boardTexture(q.board)).toBe(q.texture);
      const keys = [...q.hero, ...q.board].map((c) => c.rank + c.suit);
      expect(new Set(keys).size).toBe(5); // no duplicate cards
      const best = evaluateBestHand([...q.hero, ...q.board]);
      expect(best.rank).toBe(q.handType === 'set' ? HandRank.ThreeOfAKind : HandRank.OnePair);
      expect(correctSizes(q.texture)).toEqual(q.texture === 'wet' ? ['threeQuarter', 'pot'] : ['third', 'half']);
    }
  });

  it('mixes draw-heavy and dry boards roughly evenly', () => {
    let wet = 0;
    for (let i = 0; i < 600; i++) if (generateSizingQuestion().texture === 'wet') wet++;
    expect(wet / 600).toBeGreaterThan(0.35);
    expect(wet / 600).toBeLessThan(0.65);
  });

  it('in-game note: only a strong hand bet small on a draw-heavy board', () => {
    const wet = B('9h', '8h', '2c');
    expect(sizingNote({ board: wet, betAmount: 30, potBefore: 100, equityPercent: 70 })).toMatch(/¾ pot/);
    expect(sizingNote({ board: wet, betAmount: 60, potBefore: 100, equityPercent: 70 })).toBeNull(); // big enough
    expect(sizingNote({ board: wet, betAmount: 30, potBefore: 100, equityPercent: 40 })).toBeNull(); // not strong
    expect(sizingNote({ board: B('Ks', '7d', '2c'), betAmount: 30, potBefore: 100, equityPercent: 80 })).toBeNull(); // dry
  });
});

describe('session report', () => {
  const base = (o: Partial<SessionData> = {}): SessionData => ({
    hands: [],
    decisionScores: [],
    netChips: 0,
    mistakes: { freefold: 0, overfold: 0, overcall: 0 },
    smallValueBets: 0,
    ...o,
  });

  it('summarises hands, results and decision quality', () => {
    const r = buildSessionReport(
      base({
        hands: [{ vpip: true, won: true }, { vpip: false, won: false }, { vpip: true, won: false }, { vpip: false, won: false }],
        decisionScores: [9, 6, 3],
        netChips: -250,
      }),
    );
    expect(r.handsPlayed).toBe(4);
    expect(r.handsWon).toBe(1);
    expect(r.netChips).toBe(-250);
    expect(r.avgScore).toBe(6);
    expect(r.vpipPercent).toBe(50);
  });

  it('picks the two biggest leaks and links each to its drill', () => {
    const r = buildSessionReport(base({ mistakes: { freefold: 1, overfold: 0, overcall: 4 }, smallValueBets: 2 }));
    expect(r.leaks.map((l) => l.id)).toEqual(['overcall', 'sizing']);
    expect(r.leaks.map((l) => l.drill)).toEqual(['potodds', 'sizing']);
    expect(r.savedMistakes).toBe(5);
  });

  it('two leaks that point at the same drill count as one', () => {
    const r = buildSessionReport(base({ mistakes: { freefold: 0, overfold: 3, overcall: 4 }, smallValueBets: 1 }));
    expect(r.leaks.map((l) => l.drill)).toEqual(['potodds', 'sizing']);
  });

  it('flags playing too many hands only once there are enough of them', () => {
    const loose = (n: number) => Array.from({ length: n }, (_, i) => ({ vpip: i % 4 !== 0, won: false })); // 75%
    expect(buildSessionReport(base({ hands: loose(4) })).leaks).toHaveLength(0);
    const r = buildSessionReport(base({ hands: loose(12) }));
    expect(r.leaks[0].id).toBe('loose');
    expect(r.leaks[0].drill).toBe('position');
  });

  it('no leaks when nothing went wrong', () => {
    const hands = Array.from({ length: 10 }, (_, i) => ({ vpip: i < 3, won: i === 0 })); // 30%
    expect(buildSessionReport(base({ hands })).leaks).toHaveLength(0);
  });
});

describe('seat layout', () => {
  it('keeps every seat box on the canvas at every table size', () => {
    const W = 880;
    const H = 500;
    for (let total = 2; total <= 10; total++) {
      const half = (SEAT_BOX_W / 2) * seatScaleFor(total);
      for (let i = 0; i < total; i++) {
        const { x } = seatPosition(i, total, W, H);
        expect(x - half, `seat ${i} of ${total}`).toBeGreaterThanOrEqual(0);
        expect(x + half, `seat ${i} of ${total}`).toBeLessThanOrEqual(W);
      }
    }
  });
});
