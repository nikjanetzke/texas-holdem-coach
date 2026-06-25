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
      rng: () => 0.5,
    });
    expect(['call', 'raise']).toContain(decision.type);
  });
});
