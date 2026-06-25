import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine/deck';
import { generateAdvice, LeakTracker, scoreDecision } from '../coach';

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map((token) => ({
    rank: token.slice(0, -1) as Card['rank'],
    suit: token.slice(-1) as Card['suit'],
  }));
}

describe('generateAdvice', () => {
  it('suggests folding a weak hand facing a large bet', () => {
    const advice = generateAdvice({
      holeCards: cards('7c 2d'),
      communityCards: cards('Ah Kd Qs'),
      numOpponents: 1,
      potBeforeAction: 100,
      amountToCall: 100,
      position: 'Early',
    });
    expect(advice.suggestedAction).toBe('fold');
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });

  it('suggests betting a very strong hand when checked to', () => {
    const advice = generateAdvice({
      holeCards: cards('As Ad'),
      communityCards: cards('Ah Kd 2s'),
      numOpponents: 1,
      potBeforeAction: 50,
      amountToCall: 0,
      position: 'Late',
    });
    expect(advice.suggestedAction).toBe('bet');
  });

  it('warns about a possible flush on a 3-flush board', () => {
    const advice = generateAdvice({
      holeCards: cards('Ac Kd'),
      communityCards: cards('2h 5h 9h'),
      numOpponents: 1,
      potBeforeAction: 50,
      amountToCall: 0,
      position: 'Late',
    });
    expect(advice.warnings.some((w) => w.toLowerCase().includes('flush'))).toBe(true);
  });
});

describe('scoreDecision', () => {
  it('gives a high score when the action matches the suggestion', () => {
    const result = scoreDecision({ actualAction: 'fold', suggestedAction: 'fold', equityPercent: 10, potOddsPercent: 40, position: 'Early' });
    expect(result.score).toBe(9);
  });

  it('gives a low score for a clearly bad fold', () => {
    const result = scoreDecision({ actualAction: 'fold', suggestedAction: 'call', equityPercent: 70, potOddsPercent: 30, position: 'Early' });
    expect(result.score).toBeLessThanOrEqual(3);
  });
});

describe('LeakTracker', () => {
  it('tracks overcalling as a leak when calls are made with insufficient equity', () => {
    const tracker = new LeakTracker();
    tracker.record({ actualAction: 'call', suggestedAction: 'fold', equityPercent: 15, potOddsPercent: 40, position: 'Middle' });
    tracker.record({ actualAction: 'call', suggestedAction: 'fold', equityPercent: 10, potOddsPercent: 40, position: 'Middle' });
    const leaks = tracker.topLeaks();
    expect(leaks[0].leak).toBe('overcalling');
    expect(leaks[0].count).toBe(2);
  });
});
