import type { Card } from '../engine/deck';
import { computePotOdds, estimateEquity } from '../engine/equity';
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
}

// The raw numbers behind the advice, so the UI can show *how* the verdict was
// reached (the "show the math" breakdown) rather than just the conclusion.
export interface CoachMath {
  winPercent: number;
  tiePercent: number;
  lossPercent: number;
  iterations: number;
  numOpponents: number;
  equityPercent: number;
  potBeforeCall: number;
  amountToCall: number;
  potOddsPercent: number;
  facingBet: boolean;
}

export interface CoachAdvice {
  equityPercent: number;
  handStrengthLabel: string;
  position: Position;
  potOddsPercent: number;
  suggestedAction: ActionType;
  reasoning: string[];
  warnings: string[];
  math: CoachMath;
}

export function generateAdvice(input: CoachAdviceInput): CoachAdvice {
  const equityResult = estimateEquity(input.holeCards, input.communityCards, input.numOpponents, 300, input.rng);
  const equity = equityResult.winProbability + equityResult.tieProbability / 2;
  const handStrengthLabel = classifyHandStrength(equity);
  const potOdds = computePotOdds(input.potBeforeAction, input.amountToCall);
  const facingBet = input.amountToCall > 0;

  const reasoning: string[] = [];
  const warnings: string[] = [];
  let suggestedAction: ActionType;

  reasoning.push(`Your hand is roughly ${handStrengthLabel.toLowerCase()} here, with an estimated ${(equity * 100).toFixed(0)}% chance to win against ${input.numOpponents} opponent${input.numOpponents === 1 ? '' : 's'}.`);

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
    if (equity < 0.3 && input.amountToCall > input.potBeforeAction * 0.5) {
      warnings.push('Be careful chasing a weak draw against a large bet — the cost to continue is high relative to your actual winning chances.');
    }
  } else {
    if (equity > 0.55) {
      suggestedAction = 'bet';
      reasoning.push('Nobody has bet yet and your hand is strong enough to bet for value and build the pot.');
    } else {
      suggestedAction = 'check';
      reasoning.push('Your hand is not strong enough to bet profitably here, so checking keeps the pot small.');
    }
  }

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
    reasoning,
    warnings,
    math: {
      winPercent: equityResult.winProbability * 100,
      tiePercent: equityResult.tieProbability * 100,
      lossPercent: equityResult.lossProbability * 100,
      iterations: equityResult.iterations,
      numOpponents: input.numOpponents,
      equityPercent: equity * 100,
      potBeforeCall: potOdds.potBeforeCall,
      amountToCall: potOdds.amountToCall,
      potOddsPercent: potOdds.potOddsPercent,
      facingBet,
    },
  };
}

export type Leak = 'overcalling' | 'overfolding' | 'overbluffing' | 'ignoringPotOdds' | 'outOfPositionPlay';

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
    const outOfPosition = (record.position === 'Small Blind' || record.position === 'Big Blind') && record.actualAction !== 'fold';

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
