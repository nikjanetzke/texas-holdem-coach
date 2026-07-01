import type { Card } from '../engine/deck';
import { rankValue } from '../engine/deck';
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
  /** 0 = first to act (early), 1 = last to act (button-like). Defaults to mid. */
  positionFraction?: number;
  /** Big blind, used to floor bet sizes. */
  bigBlind?: number;
}

export interface AIDecision {
  type: ActionType;
  amount?: number;
  equity: number;
  reasoning: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// How coordinated / dangerous the board is (0 = dry, 1 = very wet). Reads flush
// and straight potential plus pairing, so bots respect scary boards.
function boardTexture(board: Card[]): { danger: number; flushy: boolean; straighty: boolean; paired: boolean } {
  if (board.length < 3) return { danger: 0, flushy: false, straighty: false, paired: false };
  const suits: Record<string, number> = {};
  board.forEach((c) => (suits[c.suit] = (suits[c.suit] ?? 0) + 1));
  const maxSuit = Math.max(...Object.values(suits));
  const flushy = maxSuit >= 3; // a flush is already possible
  const flushDraw = maxSuit === 2;

  const vals = board.map((c) => rankValue(c.rank));
  const uniq = [...new Set(vals)];
  const paired = uniq.length < vals.length;
  let straighty = false;
  for (let s = 2; s <= 10; s++) {
    if (uniq.filter((v) => v >= s && v < s + 5).length >= 3) straighty = true;
  }

  let danger = 0;
  if (flushy) danger += 0.5;
  else if (flushDraw) danger += 0.2;
  if (straighty) danger += 0.35;
  if (paired) danger += 0.15;
  return { danger: clamp(danger, 0, 1), flushy, straighty, paired };
}

export function decideAIAction(input: AIDecisionInput): AIDecision {
  const rng = input.rng ?? Math.random;
  const { profile } = input;
  const equityResult = estimateEquity(input.holeCards, input.communityCards, input.numOpponents, 250, rng);
  const equity = equityResult.winProbability + equityResult.tieProbability / 2;

  const pos = input.positionFraction ?? 0.5; // 0 early … 1 late
  const posAgg = pos - 0.5; // -0.5 … +0.5, positive = late position
  const bb = input.bigBlind ?? Math.max(1, Math.round(input.potBeforeAction / 6));
  const tex = boardTexture(input.communityCards);
  const pot = Math.max(1, input.potBeforeAction);
  const facingBet = input.amountToCall > 0;
  const eqPct = (equity * 100).toFixed(0);

  // ---- No bet to us: check or bet, with position/texture-aware sizing ----
  if (!facingBet) {
    // Value threshold to bet: tighter players and early position need more.
    const valueThresh = 0.46 + profile.tightness * 0.16 - posAgg * 0.14;
    const strong = equity > valueThresh;
    // Bluff more in late position and on scary boards we can represent.
    const bluffChance = profile.bluffFrequency * (0.35 + pos * 0.5 + tex.danger * 0.35);
    const bluff = !strong && input.stack > bb * 2 && rng() < bluffChance;

    if (strong || bluff) {
      let frac: number;
      if (strong) {
        // Bet bigger for value on wet boards; a bit bigger the more aggressive.
        frac = 0.5 + profile.aggression * 0.25 + tex.danger * 0.25;
        if (profile.aggression > 0.8 && equity > 0.8 && rng() < 0.15) frac = 1.1; // occasional overbet
      } else {
        frac = 0.4 + profile.aggression * 0.3; // bluff sizing
      }
      const amount = clamp(Math.round(pot * frac), bb, input.stack);
      return {
        type: 'bet',
        amount,
        equity,
        reasoning: strong ? `Value bet with ~${eqPct}% equity on a ${tex.danger > 0.5 ? 'wet' : 'dry'} board.` : 'Betting as a bluff to apply pressure.',
      };
    }
    return { type: 'check', equity, reasoning: `Checking with ~${eqPct}% equity — not enough to bet.` };
  }

  // ---- Facing a bet: fold / call / raise, reacting to the bet size ----
  const potOdds = computePotOdds(pot, input.amountToCall).potOddsPercent / 100;
  const betRatio = input.amountToCall / pot; // how large the bet is relative to the pot

  // Equity needed to continue: rises with a bigger bet and a scarier board;
  // looser (calling-station) profiles need less. Drawy boards get a small
  // implied-odds discount so bots peel with reasonable draws.
  let needed = potOdds + betRatio * 0.14 + tex.danger * 0.05 - (profile.callingFrequency - 0.5) * 0.22;
  if (tex.flushy || tex.straighty) needed -= 0.03;
  needed = clamp(needed, 0.05, 0.95);

  if (equity < needed - 0.03) {
    // Calling stations occasionally peel small bets anyway.
    const stubborn = betRatio < 0.55 && rng() < profile.callingFrequency * 0.3;
    if (!stubborn) {
      return { type: 'fold', equity, reasoning: `Folding: ~${eqPct}% equity is below the ~${(needed * 100).toFixed(0)}% needed vs this bet.` };
    }
  }

  // Raise: mostly with real value; more from aggressive players and in late
  // position, and as a semi-bluff on wet boards with big draws.
  const valueRaise = equity > 0.62 - posAgg * 0.06;
  let raiseChance = profile.aggression * (valueRaise ? 0.6 : 0.12) + posAgg * 0.08;
  if (tex.danger > 0.5 && equity > 0.72) raiseChance += 0.2; // protect strong hands on wet boards
  if (!valueRaise) raiseChance += profile.bluffFrequency * 0.15 * (tex.danger > 0.4 ? 1 : 0.3); // occasional semi-bluff

  if (input.validActions.includes('raise') && rng() < raiseChance) {
    const maxRaiseTo = input.currentBet - input.amountToCall + input.stack; // stack-committed cap
    const sizeFrac = 0.55 + profile.aggression * 0.4 + (equity > 0.8 ? 0.3 : 0);
    const raiseTo = clamp(input.minRaiseTo + Math.round(pot * sizeFrac), input.minRaiseTo, Math.max(input.minRaiseTo, maxRaiseTo));
    return {
      type: 'raise',
      amount: raiseTo,
      equity,
      reasoning: valueRaise ? `Raising for value with ~${eqPct}% equity.` : 'Raising as a semi-bluff with a strong draw.',
    };
  }

  return { type: 'call', equity, reasoning: `Calling: ~${eqPct}% equity meets the ~${(needed * 100).toFixed(0)}% needed.` };
}
