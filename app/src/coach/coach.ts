import type { Card } from '../engine/deck';
import { computePotOdds, estimateEquity } from '../engine/equity';
import { describeRange, likelyRange } from '../engine/ranges';
import { chenScore } from '../engine/preflop';
import type { ActionType } from '../engine/betting';

export type Position = 'Early' | 'Middle' | 'Late' | 'Small Blind' | 'Big Blind';

export function classifyPosition(seatIndexInOrder: number, totalActing: number, isSB: boolean, isBB: boolean): Position {
  if (isSB) return 'Small Blind';
  if (isBB) return 'Big Blind';
  const fraction = seatIndexInOrder / Math.max(1, totalActing - 1);
  if (fraction < 0.34) return 'Early';
  if (fraction < 0.67) return 'Middle';
  return 'Late';
}

export function classifyHandStrength(equity: number): string {
  if (equity >= 0.75) return 'Very strong';
  if (equity >= 0.55) return 'Strong';
  if (equity >= 0.4) return 'Medium';
  if (equity >= 0.25) return 'Weak';
  return 'Very weak';
}

export interface CoachAdviceInput {
  holeCards: Card[];
  communityCards: Card[];
  numOpponents: number;
  potBeforeAction: number;
  amountToCall: number;
  position: Position;
  rng?: () => number;
  /** Big blind size. With `effectiveStack`, turns on short-stack (all-in or fold) advice. */
  bigBlind?: number;
  /** Chips at risk this hand: the smaller of your stack and the biggest opponent's, counting chips already bet this round. */
  effectiveStack?: number;
  /** Your chips not yet in the pot. Used to spot when calling already puts you all-in. */
  stackBehind?: number;
}

// Short-stack play before the flop: at this many big blinds or fewer, the
// good options are all-in or fold (what the short-stack scenario teaches).
export const SHORT_STACK_BB = 15;

// Minimum equity against random hands to go all-in first, by how many
// opponents are still in. Calibrated so heads-up at ~12bb it reproduces the
// short-stack scenario's chart (K-8, A-2, Q-T, J-8 suited in; Q-5, J-4 out),
// and tightens as more players could wake up with a hand. Pairs always go in.
function shoveThreshold(opponents: number, stackBB: number): number {
  const base = opponents <= 1 ? 0.51 : opponents === 2 ? 0.37 : opponents === 3 ? 0.3 : opponents === 4 ? 0.25 : 0.22;
  if (stackBB <= 7) return base - 0.03; // nearly blinded out: go wider
  if (stackBB > 12) return base + 0.02;
  return base;
}

// The raw numbers behind the advice, so the UI can show *how* the verdict was
// reached (the "show the math" breakdown) rather than just the conclusion.
export interface CoachMath {
  winPercent: number;
  tiePercent: number;
  lossPercent: number;
  iterations: number;
  numOpponents: number;
  // The exact cards this calculation was run on. Surfaced in the breakdown so
  // there's no ambiguity about whether the numbers describe the hand actually
  // being held (and, once the board moves on, which street they came from).
  holeCards: Card[];
  boardCards: Card[];
  equityPercent: number;
  potBeforeCall: number;
  amountToCall: number;
  potOddsPercent: number;
  facingBet: boolean;
  /** What the coach assumed opponents hold, in plain English (absent = random hands). */
  rangeNote?: string;
}

export interface CoachAdvice {
  equityPercent: number;
  handStrengthLabel: string;
  position: Position;
  potOddsPercent: number;
  suggestedAction: ActionType;
  /** The suggested raise is "go all-in" (short-stack play). */
  allIn?: boolean;
  /** The main reason for the suggestion, in one sentence. */
  why?: string;
  reasoning: string[];
  warnings: string[];
  math: CoachMath;
}

// Monte Carlo sample size, scaled so the wall-clock cost stays roughly flat
// regardless of how many opponents have to be simulated and compared.
// The old flat 300 samples was far too few: the SAME spot could report 49% on
// one render and 65% on the next (measured 16-point spread), which reads as
// the coach simply being wrong. These counts hold the run-to-run spread to
// roughly a point or two while keeping the computation inside a ~200ms budget.
function iterationsFor(numOpponents: number): number {
  return Math.max(1000, Math.min(2500, Math.round(9000 / (numOpponents + 2))));
}

// Deterministic PRNG seeded from the spot itself, so a given decision always
// produces the SAME equity figure. Without this the estimate was reseeded from
// Math.random on every re-render, so the displayed percentage visibly flickered
// while the player sat on one decision — the single biggest reason the coach's
// numbers looked untrustworthy.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedForSpot(input: CoachAdviceInput): number {
  const key = [
    ...input.holeCards.map((c) => `${c.rank}${c.suit}`),
    '|',
    ...input.communityCards.map((c) => `${c.rank}${c.suit}`),
    '|',
    input.numOpponents,
  ].join('');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateAdvice(input: CoachAdviceInput): CoachAdvice {
  // Against the hands opponents' betting suggests, not random cards: a player
  // who bets the pot rarely holds a random hand (see ranges.ts).
  const ranges = likelyRange(input);
  const equityResult = estimateEquity(
    input.holeCards,
    input.communityCards,
    input.numOpponents,
    iterationsFor(input.numOpponents),
    input.rng ?? mulberry32(seedForSpot(input)),
    ranges,
  );
  const equity = equityResult.winProbability + equityResult.tieProbability / 2;
  const handStrengthLabel = classifyHandStrength(equity);
  const potOdds = computePotOdds(input.potBeforeAction, input.amountToCall);
  const facingBet = input.amountToCall > 0;

  const reasoning: string[] = [];
  const warnings: string[] = [];
  let suggestedAction: ActionType;

  const against = ranges
    ? `against the hands ${input.numOpponents === 1 ? 'your opponent is' : `your ${input.numOpponents} opponents are`} likely to have`
    : `against ${input.numOpponents} opponent${input.numOpponents === 1 ? '' : 's'}`;
  reasoning.push(`Your hand is roughly ${handStrengthLabel.toLowerCase()} here, with an estimated ${(equity * 100).toFixed(0)}% chance to win ${against}.`);

  // Position teaching, in the same green/amber vocabulary as the scenario
  // range charts. Only added preflop and only when the seat actually changes
  // how the starting hand should be viewed — one line, not a lecture.
  const preflop = input.communityCards.length === 0;
  if (preflop) {
    const chen = chenScore(input.holeCards);
    if (chen >= 8) {
      reasoning.push('This is a strong starting hand from any seat — position matters least with premium cards.');
    } else if (input.position === 'Early') {
      reasoning.push(
        chen >= 6
          ? `A playable hand, but you're first to act with players still behind you — on the range charts this is an amber hand: fine from a late seat, marginal from here.`
          : `You're in an early seat with many players still to act after you — weak and marginal hands lose the most from here, so folding cheap is usually right.`,
      );
    } else if (input.position === 'Late') {
      reasoning.push(
        chen >= 6
          ? 'You act near-last this hand — exactly the seat where a hand like this goes up in value. Amber-chart hands become playable here.'
          : 'Even from a good late seat, a weak starting hand is still weak — position improves marginal hands, it does not rescue trash.',
      );
    } else if (input.position === 'Small Blind' || input.position === 'Big Blind') {
      reasoning.push(
        'You already have chips in from the blind, but remember: after the flop you act first every round. Being "priced in" tempts people into playing too many hands from here.',
      );
    }
  } else if (input.position === 'Early') {
    reasoning.push('You act before most players this round, so they see your move first — that favors a tighter, more careful line.');
  } else if (input.position === 'Late') {
    reasoning.push('You act after most players this round — you get to see what they do before committing more chips.');
  }

  if (facingBet) {
    if (equity * 100 < potOdds.potOddsPercent) {
      suggestedAction = 'fold';
      reasoning.push(`The pot is offering you ${potOdds.potOddsPercent.toFixed(0)}% pot odds, but your equity is only about ${(equity * 100).toFixed(0)}%, so calling loses money on average.`);
      if (equity > 0.2 && equity * 100 > potOdds.potOddsPercent - 10) {
        warnings.push('This is close — if you have a strong draw with extra winning ways (like a flush and a gutshot), it can sometimes be worth a call anyway.');
      }
    } else if (equity > 0.6) {
      suggestedAction = 'raise';
      reasoning.push('Your equity comfortably beats the pot odds and is strong enough to raise for value.');
    } else {
      suggestedAction = 'call';
      reasoning.push(`Your equity (${(equity * 100).toFixed(0)}%) meets the pot odds (${potOdds.potOddsPercent.toFixed(0)}%), so calling is reasonable.`);
    }
    if (equity < 0.3 && input.amountToCall > input.potBeforeAction * 0.5 && input.communityCards.length > 0) {
      warnings.push('Be careful chasing a weak draw against a large bet — the cost to continue is high relative to your actual winning chances.');
    }
  } else {
    if (equity > 0.55 && preflop) {
      // Nothing to call before the flop = you're the big blind and everyone
      // just called. Your blind already counts as a bet, so adding more is a raise.
      suggestedAction = 'raise';
      reasoning.push('Everyone just called your big blind and your hand is strong — raise to build the pot (your blind already counts as a bet, so putting more in is called a raise).');
    } else if (equity > 0.55) {
      suggestedAction = 'bet';
      reasoning.push('Nobody has bet yet and your hand is strong enough to bet for value and build the pot.');
    } else if (preflop) {
      suggestedAction = 'check';
      reasoning.push('Your hand is not strong enough to raise here — checking lets you see the flop for free, since your big blind already covers the price.');
    } else {
      suggestedAction = 'check';
      reasoning.push('Your hand is not strong enough to bet profitably here, so checking keeps the pot small.');
    }
  }

  // Short stack before the flop: all-in or fold. Raising small, or just
  // calling, leaves too few chips to play the rest of the hand.
  let allIn = false;
  const stackBB = input.bigBlind && input.effectiveStack != null ? input.effectiveStack / input.bigBlind : Infinity;
  if (preflop && stackBB <= SHORT_STACK_BB) {
    const bbs = Math.max(1, Math.round(stackBB));
    const unopened = input.amountToCall <= (input.bigBlind ?? 0); // nobody has raised yet
    const callIsAllIn = input.stackBehind != null && input.amountToCall >= input.stackBehind;
    const isPair = input.holeCards.length === 2 && input.holeCards[0].rank === input.holeCards[1].rank;
    reasoning.length = 1; // keep the hand-strength line; replace the deep-stack reasoning
    if (unopened) {
      if (isPair || equity >= shoveThreshold(input.numOpponents, stackBB)) {
        suggestedAction = 'raise';
        allIn = true;
        reasoning.push(
          `You only have about ${bbs} big blinds — too few to raise, miss the flop and fold. Go all-in: everyone else has to fold all but their good hands, and even when you're called this hand has a real chance.`,
        );
      } else if (input.amountToCall === 0) {
        suggestedAction = 'check';
        reasoning.push(`You only have about ${bbs} big blinds, so only go all-in with good hands. This one isn't, but you can check and see the flop for free.`);
      } else {
        suggestedAction = 'fold';
        reasoning.push(
          `You only have about ${bbs} big blinds: the good options are all-in or fold. This hand isn't strong enough to risk everything, so fold and wait for a better one. Just calling wastes chips you can't spare.`,
        );
      }
    } else if (suggestedAction === 'call' || suggestedAction === 'raise') {
      if (callIsAllIn) {
        suggestedAction = 'call';
        reasoning.push(`Calling puts all your chips in, and your ${(equity * 100).toFixed(0)}% chance to win is worth the ${potOdds.potOddsPercent.toFixed(0)}% the call costs.`);
      } else {
        suggestedAction = 'raise';
        allIn = true;
        reasoning.push(
          `You're short (about ${bbs} big blinds). With a hand good enough to continue, go all-in rather than calling — a call leaves you too few chips to play the rest of the hand, and going all-in can make them fold.`,
        );
      }
    } else {
      reasoning.push(`Someone has raised and you only have about ${bbs} big blinds. Your ${(equity * 100).toFixed(0)}% chance isn't worth the ${potOdds.potOddsPercent.toFixed(0)}% it costs to continue — fold.`);
    }
  }

  // The line that explains the suggestion itself (pushed last by the decision logic above).
  const why = reasoning[reasoning.length - 1];

  if (input.position === 'Small Blind' || input.position === 'Big Blind') {
    if (input.communityCards.length > 0) {
      warnings.push('You will be out of position for the rest of the hand, acting before your opponents on later streets.');
    }
  }

  const board = input.communityCards;
  if (board.length >= 3) {
    const suits = board.map((c) => c.suit);
    const flushPossible = new Set(suits).size <= 2 && board.length >= 3 && suits.filter((s) => s === suits[0]).length >= 3;
    if (flushPossible) {
      warnings.push('The board has three or more cards of the same suit — a flush is possible.');
    }
  }

  if (equity >= 0.75) {
    reasoning.push('This is a strong showdown hand; look for value rather than slowing down.');
  }

  return {
    equityPercent: equity * 100,
    handStrengthLabel,
    position: input.position,
    potOddsPercent: potOdds.potOddsPercent,
    suggestedAction,
    allIn,
    why,
    reasoning,
    warnings,
    math: {
      winPercent: equityResult.winProbability * 100,
      tiePercent: equityResult.tieProbability * 100,
      lossPercent: equityResult.lossProbability * 100,
      iterations: equityResult.iterations,
      numOpponents: input.numOpponents,
      holeCards: input.holeCards,
      boardCards: input.communityCards,
      equityPercent: equity * 100,
      potBeforeCall: potOdds.potBeforeCall,
      amountToCall: potOdds.amountToCall,
      potOddsPercent: potOdds.potOddsPercent,
      facingBet,
      rangeNote: describeRange(ranges, input.communityCards.length > 0, input.communityCards.length >= 5),
    },
  };
}

/** What to call the suggestion on screen: "all in" for a short-stack shove, otherwise the action. */
export function suggestionLabel(advice: Pick<CoachAdvice, 'suggestedAction' | 'allIn'>): string {
  return advice.allIn ? 'all in' : advice.suggestedAction;
}

export type Leak = 'overcalling' | 'overfolding' | 'overbluffing' | 'ignoringPotOdds' | 'outOfPositionPlay';

/** Each leak in plain English: a short title and what it means. */
export const LEAK_TEXT: Record<Leak, { title: string; detail: string }> = {
  overcalling: { title: 'Calling too often', detail: 'Calling when your chance of winning was well below what the call cost.' },
  overfolding: { title: 'Folding too often', detail: 'Folding hands that won often enough to be worth a call.' },
  overbluffing: { title: 'Raising with weak hands', detail: 'Raising with under a 30% chance to win. Bluffs need the right spot.' },
  ignoringPotOdds: {
    title: 'Not using pot odds',
    detail: 'Calls and folds that ignored the price: compare what a call costs with what you can win.',
  },
  outOfPositionPlay: {
    title: 'Calling weak hands from the blinds',
    detail: 'From the blinds you act first after the flop, a tough spot — so calling with a weak hand there costs chips. Play fewer, stronger hands.',
  },
};

export interface DecisionRecord {
  actualAction: ActionType;
  suggestedAction: ActionType;
  equityPercent: number;
  potOddsPercent: number;
  position: Position;
}

export function scoreDecision(record: DecisionRecord): { score: number; explanation: string } {
  if (record.actualAction === record.suggestedAction) {
    return { score: 9, explanation: 'This matches the recommended play for the situation.' };
  }

  const actionRank: Record<ActionType, number> = { fold: 0, check: 1, call: 2, bet: 3, raise: 4, 'all-in': 5 };
  const diff = Math.abs(actionRank[record.actualAction] - actionRank[record.suggestedAction]);

  if (diff <= 1) {
    return { score: 6, explanation: 'Close to the recommended play; a reasonable alternative in many situations.' };
  }
  if (record.actualAction === 'fold' && record.equityPercent > record.potOddsPercent + 15) {
    return { score: 3, explanation: 'This was likely too tight a fold — your equity comfortably beat the pot odds.' };
  }
  if ((record.actualAction === 'call' || record.actualAction === 'raise') && record.equityPercent < record.potOddsPercent - 15) {
    return { score: 2, explanation: 'This was likely too loose — your equity did not justify continuing.' };
  }
  return { score: 4, explanation: 'This deviates from the recommended play for this spot.' };
}

export class LeakTracker {
  private counts: Record<Leak, number> = {
    overcalling: 0,
    overfolding: 0,
    overbluffing: 0,
    ignoringPotOdds: 0,
    outOfPositionPlay: 0,
  };
  private totalDecisions = 0;

  record(record: DecisionRecord): void {
    this.totalDecisions++;
    const calledTooLoose = (record.actualAction === 'call' || record.actualAction === 'raise') && record.equityPercent < record.potOddsPercent - 10;
    const foldedTooTight = record.actualAction === 'fold' && record.equityPercent > record.potOddsPercent + 15;
    const bluffedWeak = record.actualAction === 'raise' && record.equityPercent < 30;
    // Only paying to carry on with a weak hand counts — checking for free, or
    // playing a strong hand from the blinds, is fine (it used to count every
    // non-fold, so the leak fired on most decisions at small tables).
    const outOfPosition =
      (record.position === 'Small Blind' || record.position === 'Big Blind') && record.actualAction === 'call' && record.equityPercent < 40;

    if (calledTooLoose) this.counts.overcalling++;
    if (foldedTooTight) this.counts.overfolding++;
    if (bluffedWeak) this.counts.overbluffing++;
    if (calledTooLoose || foldedTooTight) this.counts.ignoringPotOdds++;
    if (outOfPosition) this.counts.outOfPositionPlay++;
  }

  topLeaks(limit = 3): { leak: Leak; count: number; percentOfHands: number }[] {
    return (Object.entries(this.counts) as [Leak, number][])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([leak, count]) => ({ leak, count, percentOfHands: this.totalDecisions ? (count / this.totalDecisions) * 100 : 0 }));
  }

  toJSON(): { counts: Record<Leak, number>; totalDecisions: number } {
    return { counts: { ...this.counts }, totalDecisions: this.totalDecisions };
  }

  static fromJSON(data: { counts: Record<Leak, number>; totalDecisions: number } | undefined): LeakTracker {
    const tracker = new LeakTracker();
    if (data) {
      tracker.counts = { ...tracker.counts, ...data.counts };
      tracker.totalDecisions = data.totalDecisions;
    }
    return tracker;
  }
}
