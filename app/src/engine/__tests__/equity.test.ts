import { describe, expect, it } from 'vitest';
import type { Card } from '../deck';
import { computePotOdds, estimateEquity } from '../equity';

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map((token) => ({
    rank: token.slice(0, -1) as Card['rank'],
    suit: token.slice(-1) as Card['suit'],
  }));
}

describe('estimateEquity', () => {
  it('gives pocket aces a large equity edge over one random opponent preflop', () => {
    const result = estimateEquity(cards('Ah As'), [], 1, 300);
    expect(result.winProbability).toBeGreaterThan(0.7);
  });

  it('gives a weak hand low equity against one opponent preflop', () => {
    const result = estimateEquity(cards('7c 2d'), [], 1, 300);
    expect(result.winProbability).toBeLessThan(0.5);
  });

  it('returns certain win with zero opponents', () => {
    const result = estimateEquity(cards('Ah As'), [], 0);
    expect(result.winProbability).toBe(1);
  });

  it('correctly resolves equity when the board is already complete', () => {
    // Hero has the nut flush on a 5-card board; certain win vs one random opponent without that suit combo overlap handled by deck removal.
    const result = estimateEquity(cards('Ah Kh'), cards('2h 5h 9h Jd 3c'), 1, 200);
    expect(result.winProbability).toBeGreaterThan(0.9);
  });
});

describe('computePotOdds', () => {
  it('computes breakeven equity needed to call', () => {
    const odds = computePotOdds(100, 50);
    expect(odds.potOddsPercent).toBeCloseTo(33.33, 1);
  });

  it('returns zero when there is nothing to call', () => {
    const odds = computePotOdds(100, 0);
    expect(odds.potOddsPercent).toBe(0);
  });
});
