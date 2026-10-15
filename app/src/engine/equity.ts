import type { Card } from './deck';
import { makeDeck } from './deck';
import { compareHandValues, evaluateBestHand } from './evaluator';
import { fitsRange, type OpponentRanges } from './ranges';

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
 * Monte Carlo equity estimate for the hero's hole cards against N opponents,
 * given the known community cards so far (0, 3, 4, or 5 cards). Opponents hold
 * random hands, or — with `ranges` — hands that fit what their betting suggests
 * (the first opponent is the bettor; see ranges.ts).
 */
export function estimateEquity(
  heroHoleCards: Card[],
  communityCards: Card[],
  numOpponents: number,
  iterations = 1000,
  rng: () => number = Math.random,
  ranges?: OpponentRanges,
): EquityResult {
  if (numOpponents < 1) {
    return { winProbability: 1, tieProbability: 0, lossProbability: 0, iterations: 0 };
  }

  const known = [...heroHoleCards, ...communityCards];
  let wins = 0;
  let ties = 0;
  let losses = 0;

  // Build the undealt deck ONCE and reuse it across iterations. Previously this
  // rebuilt a 52-card deck and fully shuffled it on every single iteration,
  // which dominated the runtime and forced the sample size down to a level
  // where the reported equity visibly wobbled (the same spot could read 49% or
  // 65% run to run). We only ever consume the first few cards, so a partial
  // Fisher-Yates over just those positions is both correct (still a uniform
  // sample without replacement) and dramatically cheaper.
  const deck = remainingDeck(known);
  const deckLen = deck.length;
  const boardNeeded = 5 - communityCards.length;
  const cardsNeeded = boardNeeded + numOpponents * 2;

  // Scratch buffers reused every iteration to avoid per-iteration allocation.
  const board: Card[] = new Array(5);
  for (let i = 0; i < communityCards.length; i++) board[i] = communityCards[i];
  const heroSeven: Card[] = new Array(5 + heroHoleCards.length);
  const oppSeven: Card[] = new Array(5 + 2);

  const oppHole: Card[] = new Array(2);

  for (let i = 0; i < iterations; i++) {
    // Partial shuffle: pull `cardsNeeded` uniformly-random distinct cards to
    // the front of the deck. Only these positions get touched per iteration.
    for (let k = 0; k < cardsNeeded; k++) {
      const j = k + Math.floor(rng() * (deckLen - k));
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
    }

    // Layout of the front of the deck: opponents' hole cards, then the rest of the board.
    // With ranges, any opponent hand that doesn't fit theirs is swapped for another
    // random pair from the undealt cards (after a few dozen misses, take what
    // comes, so a very narrow range can't stall the simulation).
    if (ranges) {
      for (let o = 0; o < numOpponents; o++) {
        const range = o === 0 ? ranges.bettor : ranges.others;
        if (!range) continue;
        const at = o * 2;
        for (let tries = 0; tries < 40; tries++) {
          oppHole[0] = deck[at];
          oppHole[1] = deck[at + 1];
          if (fitsRange(oppHole, communityCards, range, rng())) break;
          for (let k = at; k < at + 2; k++) {
            const j = k + Math.floor(rng() * (deckLen - k));
            const tmp = deck[k];
            deck[k] = deck[j];
            deck[j] = tmp;
          }
        }
      }
    }
    let drawIndex = numOpponents * 2;
    for (let b = communityCards.length; b < 5; b++) board[b] = deck[drawIndex++];

    for (let c = 0; c < heroHoleCards.length; c++) heroSeven[c] = heroHoleCards[c];
    for (let c = 0; c < 5; c++) heroSeven[heroHoleCards.length + c] = board[c];
    const heroValue = evaluateBestHand(heroSeven);

    let heroBeatsAll = true;
    let tiesWithBest = false;

    for (let o = 0; o < numOpponents; o++) {
      oppSeven[0] = deck[o * 2];
      oppSeven[1] = deck[o * 2 + 1];
      for (let c = 0; c < 5; c++) oppSeven[2 + c] = board[c];
      const cmp = compareHandValues(heroValue, evaluateBestHand(oppSeven));
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
