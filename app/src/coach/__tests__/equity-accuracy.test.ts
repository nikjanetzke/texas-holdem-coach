import { describe, expect, it } from 'vitest';
import { generateAdvice } from '../coach';
import type { Card } from '../../engine/deck';

const C = (s: string): Card => ({ rank: s.slice(0, -1) as Card['rank'], suit: s.slice(-1) as Card['suit'] });
const spot = (hole: string[], board: string[], opps: number) => ({
  holeCards: hole.map(C),
  communityCards: board.map(C),
  numOpponents: opps,
  potBeforeAction: 300,
  amountToCall: 100,
  position: 'Late' as const,
});

describe('coach equity accuracy', () => {
  // Published all-in preflop equities. The coach only needs to be close, not
  // exact — but it must not be wildly wrong, which is what a too-small Monte
  // Carlo sample was producing.
  const references: [string, ReturnType<typeof spot>, number][] = [
    ['AA vs 1', spot(['As', 'Ah'], [], 1), 85.2],
    ['KK vs 1', spot(['Ks', 'Kh'], [], 1), 82.4],
    ['AKs vs 1', spot(['As', 'Ks'], [], 1), 67.0],
    ['22 vs 1', spot(['2s', '2h'], [], 1), 50.3],
    ['72o vs 1', spot(['7s', '2h'], [], 1), 34.6],
    ['JTs vs 1', spot(['Js', 'Ts'], [], 1), 57.0],
    ['AA vs 5', spot(['As', 'Ah'], [], 5), 49.0],
  ];

  for (const [name, input, expected] of references) {
    it(`${name} is within 3 points of ${expected}%`, () => {
      const got = generateAdvice(input).equityPercent;
      expect(Math.abs(got - expected)).toBeLessThan(3);
    });
  }

  it('reports the same equity every time for an identical spot', () => {
    // The estimate is seeded from the spot itself. Without this the number
    // visibly flickered between re-renders while the player sat on one
    // decision, which made the coach look unreliable.
    const s = spot(['As', 'Ks'], ['Qs', '7s', '2h'], 2);
    const runs = Array.from({ length: 6 }, () => generateAdvice(s).equityPercent);
    expect(new Set(runs).size).toBe(1);
  });

  it('reports the cards the calculation was actually run on', () => {
    const s = spot(['As', 'Ks'], ['Qs', '7s', '2h'], 2);
    const { math } = generateAdvice(s);
    expect(math.holeCards).toHaveLength(2);
    expect(math.boardCards).toHaveLength(3);
    expect(math.holeCards[0]).toEqual(C('As'));
  });

  it('equity falls as more opponents are added', () => {
    const eq = (n: number) => generateAdvice(spot(['As', 'Ah'], [], n)).equityPercent;
    const values = [1, 3, 5, 8].map(eq);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });
});
