import type { Card } from '../engine/deck';
import { computePotOdds, estimateEquity } from '../engine/equity';
import type { ActionType } from '../engine/betting';
import type { AIProfile } from './profiles';

export interface AIDecisionInput {
  holeCards: Card[];
  communityCards: Card[];
  numOpponents: number;
  potBeforeAction: number;
  amountToCall: number;
  stack: number;
  currentBet: number;
  minRaiseTo: number;
  validActions: ActionType[];
  profile: AIProfile;
  rng?: () => number;
}

export interface AIDecision {
  type: ActionType;
  amount?: number;
  equity: number;
  reasoning: string;
}

export function decideAIAction(input: AIDecisionInput): AIDecision {
  const rng = input.rng ?? Math.random;
  const equityResult = estimateEquity(input.holeCards, input.communityCards, input.numOpponents, 250, rng);
  const equity = equityResult.winProbability + equityResult.tieProbability / 2;
  const { profile } = input;

  const facingBet = input.amountToCall > 0;

  if (!facingBet) {
    // Decide between checking and betting.
    const strongHand = equity > 0.4 + profile.tightness * 0.2;
    const bluffRoll = rng() < profile.bluffFrequency * 0.5;
    if (strongHand || bluffRoll) {
      const betFraction = 0.4 + profile.aggression * 0.6;
      const amount = Math.max(1, Math.round(input.potBeforeAction * betFraction));
      const capped = Math.min(amount, input.stack);
      return {
        type: 'bet',
        amount: capped,
        equity,
        reasoning: strongHand
          ? `Betting for value with an estimated ${(equity * 100).toFixed(0)}% equity.`
          : 'Betting as a bluff to represent strength.',
      };
    }
    return { type: 'check', equity, reasoning: 'Hand is not strong enough to bet; checking.' };
  }

  const potOdds = computePotOdds(input.potBeforeAction, input.amountToCall);
  const callThreshold = potOdds.potOddsPercent / 100 - (profile.callingFrequency - 0.5) * 0.15;

  if (equity < callThreshold && rng() > profile.callingFrequency * 0.3) {
    return {
      type: 'fold',
      equity,
      reasoning: `Equity (${(equity * 100).toFixed(0)}%) is below the pot-odds breakeven (${potOdds.potOddsPercent.toFixed(0)}%).`,
    };
  }

  const raiseChance = profile.aggression * 0.4 * (equity > 0.6 ? 1.5 : 0.5);
  if (input.validActions.includes('raise') && rng() < raiseChance) {
    const raiseTo = Math.min(input.minRaiseTo + Math.round(input.potBeforeAction * profile.aggression * 0.5), input.stack + (input.currentBet - input.amountToCall));
    return {
      type: 'raise',
      amount: raiseTo,
      equity,
      reasoning: `Raising with strong equity (${(equity * 100).toFixed(0)}%) to build the pot.`,
    };
  }

  return {
    type: 'call',
    equity,
    reasoning: `Calling: equity (${(equity * 100).toFixed(0)}%) meets the pot-odds breakeven (${potOdds.potOddsPercent.toFixed(0)}%).`,
  };
}
