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
import {
  SEAT_BOX_W,
  betChipsArea,
  betChipsSpot,
  bubbleRect,
  chooseBubbleSide,
  foldedCardsArea,
  foldedCardsSpot,
  seatBoxRect,
  seatPosition,
  seatScaleFor,
  tableCentreRects,
  type Rect,
} from '../../pixi/seatLayout';

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

describe('nothing on the table covers anything else', () => {
  const W = 880;
  const H = 500;
  const CW = 57; // card size used on the table
  const CH = 80;
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const onCanvas = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
  const { board, pot } = tableCentreRects(W, H, CW, CH);
  // Seat 0 is you (bottom centre, drawn full size); opponents shrink on big tables.
  const rects = (total: number) => Array.from({ length: total }, (_, i) => seatBoxRect(i, total, W, H, i === 0 ? 1 : seatScaleFor(total)));

  it('folded cards never land on the community cards', () => {
    for (let total = 2; total <= 10; total++) {
      const scale = seatScaleFor(total);
      for (let i = 0; i < total; i++) {
        const area = foldedCardsArea(foldedCardsSpot(i, total, W, H, scale, CW, CH, board), scale, CW, CH);
        expect(overlaps(area, board), `seat ${i} of ${total}`).toBe(false);
        expect(onCanvas(area), `seat ${i} of ${total}`).toBe(true);
      }
    }
  });

  it('a short bubble ("I win!") never covers the pot, the board, another seat, or leaves the table', () => {
    for (let total = 2; total <= 10; total++) {
      const seats = rects(total);
      for (let i = 0; i < total; i++) {
        const sc = i === 0 ? 1 : seatScaleFor(total);
        const bw = 80 * sc;
        const bh = 34 * sc;
        const others = seats.filter((_, j) => j !== i);
        const side = chooseBubbleSide(seats[i], bw, bh, others, W, H, [board, pot]);
        const r = bubbleRect(side, seats[i], bw, bh);
        const where = `seat ${i} of ${total} (${side})`;
        expect(overlaps(r, pot), where).toBe(false);
        expect(overlaps(r, board), where).toBe(false);
        expect(others.some((o) => overlaps(r, o)), where).toBe(false);
        expect(onCanvas(r), where).toBe(true);
      }
    }
  });

  it('your own bubble stays off the pot label, even a two-line chat message', () => {
    for (let total = 2; total <= 10; total++) {
      const seats = rects(total);
      for (const [bw, bh] of [[80, 34], [215, 56]]) {
        const side = chooseBubbleSide(seats[0], bw, bh, seats.slice(1), W, H, [board, pot]);
        expect(overlaps(bubbleRect(side, seats[0], bw, bh), pot), `${total} players, ${bw}x${bh} (${side})`).toBe(false);
      }
    }
  });

  it("bet chips never sit on their own seat, another seat, the board, or the pot", () => {
    for (let total = 2; total <= 10; total++) {
      const seats = rects(total);
      for (let i = 0; i < total; i++) {
        for (const grow of i === 0 ? [1, 1.12] : [seatScaleFor(total)]) {
          const box = seatBoxRect(i, total, W, H, grow);
          const others = seats.filter((_, j) => j !== i);
          const area = betChipsArea(betChipsSpot(i, total, W, H, box, [...others, board, pot]));
          const where = `seat ${i} of ${total}, grow ${grow}`;
          expect(overlaps(area, box), where).toBe(false);
          expect(overlaps(area, pot), where).toBe(false);
          expect(overlaps(area, board), where).toBe(false);
          expect(others.some((o) => overlaps(area, o)), where).toBe(false);
          expect(onCanvas(area), where).toBe(true);
        }
      }
    }
  });
});

