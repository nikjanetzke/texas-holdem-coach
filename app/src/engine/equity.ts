import type { Card } from './deck';
import { makeDeck, shuffle } from './deck';
import { compareHandValues, evaluateBestHand } from './evaluator';

export interface EquityResult {
  winProbability: number;
  tieProbability: number;
  lossProbability: number;
  iterations: number;
}

function remainingDeck(used: Card[]): Card[] {
  const usedKeys = new Set(used.map((c) => `${c.rank}${c.suit}`));
  return makeDeck().filter((c) => !usedKeys.has(`${c.rank}${c.suit}`));
}

/**
 * Monte Carlo equity estimate for the hero's hole cards against N random opponents,
 * given the known community cards so far (0, 3, 4, or 5 cards).
 */
export function estimateEquity(
  heroHoleCards: Card[],
  communityCards: Card[],
  numOpponents: number,
  iterations = 1000,
  rng: () => number = Math.random,
): EquityResult {
  if (numOpponents < 1) {
    return { winProbability: 1, tieProbability: 0, lossProbability: 0, iterations: 0 };
  }

  const known = [...heroHoleCards, ...communityCards];
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let i = 0; i < iterations; i++) {
    const deck = shuffle(remainingDeck(known), rng);
    let drawIndex = 0;

    const board = [...communityCards];
    while (board.length < 5) board.push(deck[drawIndex++]);

    const opponentHoleCards: Card[][] = [];
    for (let o = 0; o < numOpponents; o++) {
      opponentHoleCards.push([deck[drawIndex++], deck[drawIndex++]]);
    }

    const heroValue = evaluateBestHand([...heroHoleCards, ...board]);
    let heroBeatsAll = true;
    let tiesWithBest = false;

    for (const oppCards of opponentHoleCards) {
      const oppValue = evaluateBestHand([...oppCards, ...board]);
      const cmp = compareHandValues(heroValue, oppValue);
      if (cmp < 0) {
        heroBeatsAll = false;
        break;
      }
      if (cmp === 0) tiesWithBest = true;
    }

    if (heroBeatsAll && tiesWithBest) ties++;
    else if (heroBeatsAll) wins++;
    else losses++;
  }

  return {
    winProbability: wins / iterations,
    tieProbability: ties / iterations,
    lossProbability: losses / iterations,
    iterations,
  };
}

export interface PotOdds {
  potBeforeCall: number;
  amountToCall: number;
  potOddsPercent: number; // breakeven equity needed to call, as a percent
}

export function computePotOdds(potBeforeCall: number, amountToCall: number): PotOdds {
  if (amountToCall <= 0) {
    return { potBeforeCall, amountToCall, potOddsPercent: 0 };
  }
  const potOddsPercent = (amountToCall / (potBeforeCall + amountToCall)) * 100;
  return { potBeforeCall, amountToCall, potOddsPercent };
}
