import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine/deck';
import { decideAIAction } from '../decide';
import { AI_ARCHETYPES } from '../profiles';

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map((token) => ({
    rank: token.slice(0, -1) as Card['rank'],
    suit: token.slice(-1) as Card['suit'],
  }));
}

// A real (but deterministic) PRNG. A constant rng like `() => 0.5` must NOT be
// used for anything that runs an equity simulation: every Monte Carlo
// iteration then draws the exact same cards, so the estimate collapses to a
// degenerate 0% or 100% and the AI is being tested against a shuffling
// artifact rather than a realistic equity. Seeded so runs stay reproducible.
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('decideAIAction', () => {
  it('a tight AI folds a weak hand facing a big bet', () => {
    const decision = decideAIAction({
      holeCards: cards('7c 2d'),
      communityCards: cards('Ah Kd Qs'),
      numOpponents: 1,
      potBeforeAction: 100,
      amountToCall: 100,
      stack: 500,
      currentBet: 100,
      minRaiseTo: 200,
      validActions: ['fold', 'call', 'raise'],
      profile: AI_ARCHETYPES.tight,
      rng: () => 0.99,
    });
    expect(decision.type).toBe('fold');
  });

  it('returns a check or bet when nothing is owed', () => {
    const decision = decideAIAction({
      holeCards: cards('As Ad'),
      communityCards: cards('Ah Kd 2s'),
      numOpponents: 1,
      potBeforeAction: 50,
      amountToCall: 0,
      stack: 500,
      currentBet: 0,
      minRaiseTo: 20,
      validActions: ['check', 'bet'],
      profile: AI_ARCHETYPES.looseAggressive,
      rng: () => 0.1,
    });
    expect(['check', 'bet']).toContain(decision.type);
  });

  it('a calling station calls more often than it folds with marginal equity', () => {
    // 9h8h on 2c5dJh is ~34% against one opponent — genuinely marginal, and
    // cheap to continue (20 into a 100 pot needs only ~17%). A calling station
    // should take this the large majority of the time.
    let continued = 0;
    const runs = 25;
    for (let i = 0; i < runs; i++) {
      const decision = decideAIAction({
        holeCards: cards('9h 8h'),
        communityCards: cards('2c 5d Jh'),
        numOpponents: 1,
        potBeforeAction: 100,
        amountToCall: 20,
        stack: 500,
        currentBet: 20,
        minRaiseTo: 40,
        validActions: ['fold', 'call', 'raise'],
        profile: AI_ARCHETYPES.callingStation,
        rng: seededRng(1000 + i),
      });
      if (decision.type === 'call' || decision.type === 'raise') continued++;
    }
    expect(continued).toBeGreaterThan(runs / 2);
  });
});
