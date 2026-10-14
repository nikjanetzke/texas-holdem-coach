import type { Card } from '../engine/deck';
import type { ActionType } from '../engine/betting';
import type { Street } from '../engine/game';
import { SHARED_CLOCK_DECK, addDueNow, loadDeck, saveDeck } from './srs';

// "Practise your mistakes": clear-cut errors from real hands are saved and
// replayed later as a drill, with spaced repetition.
//
// Only CLEAR maths errors qualify — not every disagreement with the coach. The
// coach's equity is measured against random hands, which overstates your
// chances against someone who is betting. A borderline spot like "fold K5 to a
// raise" is fine poker, and drilling it as a mistake would teach the wrong
// lesson. So a decision is only saved if it's wrong by a wide margin:

export type MistakeKind =
  /** Folded when you could have checked for nothing. Always wrong. */
  | 'freefold'
  /** Folded while a clear favourite (50%+) at a price well under your equity. */
  | 'overfold'
  /** Called with equity far below the price the pot was offering. */
  | 'overcall';

export const OVERFOLD_MIN_EQUITY = 50;
export const OVERFOLD_MARGIN = 20;
export const OVERCALL_MARGIN = 15;

export interface MistakeInput {
  action: ActionType;
  validTypes: ActionType[];
  callAmount: number;
  equityPercent: number;
  potOddsPercent: number;
}

export function classifyMistake(m: MistakeInput): MistakeKind | null {
  if (m.action === 'fold' && m.validTypes.includes('check')) return 'freefold';
  if (
    m.action === 'fold' &&
    m.callAmount > 0 &&
    m.equityPercent >= OVERFOLD_MIN_EQUITY &&
    m.equityPercent >= m.potOddsPercent + OVERFOLD_MARGIN
  ) {
    return 'overfold';
  }
  // Only a flat CALL counts. A raise with weak equity can be a deliberate
  // bluff that wins through fold equity — not a pure maths error.
  if (m.action === 'call' && m.callAmount > 0 && m.equityPercent < m.potOddsPercent - OVERCALL_MARGIN) {
    return 'overcall';
  }
  return null;
}

export interface MistakeSpot {
  kind: MistakeKind;
  holeCards: Card[];
  board: Card[];
  street: Street;
  /** Pot before your decision. */
  pot: number;
  toCall: number;
  numOpponents: number;
  position: string;
  equityPercent: number;
  potOddsPercent: number;
  /** What you actually did at the table. */
  actualAction: ActionType;
  savedAt: number;
}

export type DrillChoice = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** The buttons the replay offers — same shape as the real table at that moment. */
export function choicesFor(spot: MistakeSpot): DrillChoice[] {
  return spot.toCall > 0 ? ['fold', 'call', 'raise'] : ['check', 'bet', 'fold'];
}

/** Every answer that counts as right for this spot. */
export function correctChoices(spot: MistakeSpot): DrillChoice[] {
  switch (spot.kind) {
    case 'freefold':
      return ['check', 'bet'];
    case 'overfold':
      return ['call', 'raise'];
    case 'overcall':
      return ['fold'];
  }
}

export function explainMistake(spot: MistakeSpot): string {
  const eq = Math.round(spot.equityPercent);
  const odds = Math.round(spot.potOddsPercent);
  switch (spot.kind) {
    case 'freefold':
      return 'Nobody had bet, so checking cost nothing and let you see the next card for free. Folding when you can check gives up your share of the pot for no reason — it is never correct.';
    case 'overfold':
      return `You'd win about ${eq}% of the time against ${spot.numOpponents} opponent${spot.numOpponents === 1 ? '' : 's'}, and calling only needed you to win ${odds}% to break even. Being a favourite at a cheap price means continuing makes money over time.`;
    case 'overcall':
      return `Calling ${spot.toCall} into a pot of ${spot.pot} needed you to win at least ${odds}% of the time, but your hand only wins about ${eq}%. Each call like this loses money on average — folding is the disciplined play.`;
  }
}

export function mistakeId(spot: Pick<MistakeSpot, 'holeCards' | 'board' | 'toCall'>): string {
  const k = (cs: Card[]) => cs.map((c) => `${c.rank}${c.suit}`).join('');
  return `${k(spot.holeCards)}|${k(spot.board)}|${spot.toCall}`;
}

export const MISTAKES_DECK = SHARED_CLOCK_DECK;

export function saveMistake(spot: MistakeSpot): void {
  saveDeck(MISTAKES_DECK, addDueNow(loadDeck<MistakeSpot>(MISTAKES_DECK), mistakeId(spot), spot));
}
