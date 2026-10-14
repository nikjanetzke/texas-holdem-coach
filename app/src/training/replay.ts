import type { Card } from '../engine/deck';
import type { ActionLogEntry, ShowdownResult, Street } from '../engine/game';
import { HAND_RANK_NAMES } from '../engine/evaluator';

// Hand replayer: turns a recorded hand into steps you can walk through one at
// a time — the deal, every action, each new card, the showdown and who won —
// with the pot and every player's chips at each point, and the coach's verdict
// attached to each of your own decisions. Pure, so it can be unit tested.

/** What the coach made of one of your decisions, saved when you made it. */
export interface DecisionCoachNote {
  /** What the coach suggested, as shown on screen ("call", "all in"...). */
  suggested: string;
  score: number;
  explanation: string;
  /** The coach's main reason for its suggestion. */
  reason?: string;
  equityPercent: number;
  potOddsPercent: number;
  /** Chips you had to put in to call (0 = you could check). */
  toCall: number;
}

/** A recorded hand (HandRecord fits; the optional fields exist on hands recorded since the replayer). */
export interface ReplayHand {
  handNumber: number;
  players: { id: string; name: string; holeCards: Card[] }[];
  communityCards: Card[];
  actionLog: ActionLogEntry[];
  showdownResult: ShowdownResult | null;
  /** Your decisions in order; `coach` is present on hands recorded since the replayer. */
  decisionTimings?: { coach?: DecisionCoachNote }[];
  /** Everyone's chips before the hand. Older hands don't have it; stacks are then left out. */
  startStacks?: Record<string, number>;
}

export interface ReplaySeat {
  id: string;
  name: string;
  holeCards: Card[];
  /** Chips behind, or null when the hand predates start stacks being recorded. */
  stack: number | null;
  /** Chips put in on the current betting round. */
  inFront: number;
  folded: boolean;
  allIn: boolean;
  /** Face-up at this step (always for you; others once they show down). */
  cardsShown: boolean;
  isYou: boolean;
}

export type ReplayStepKind = 'deal' | 'action' | 'street' | 'showdown' | 'result';

export interface ReplayStep {
  kind: ReplayStepKind;
  street: Street;
  board: Card[];
  pot: number;
  seats: ReplaySeat[];
  /** Who just acted, for highlighting. */
  actorId?: string;
  /** What happened, in plain English. */
  text: string;
  /** On your own decisions: what you did and the coach's verdict. */
  decision?: { coach?: DecisionCoachNote };
}

const SUIT: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const cardText = (c: Card) => `${c.rank === 'T' ? '10' : c.rank}${SUIT[c.suit]}`;
const cardsText = (cs: Card[]) => cs.map(cardText).join(' ');
const money = (n: number) => `$${n.toLocaleString()}`;
const BOARD_SIZE: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const STREET_NAME: Record<string, string> = { flop: 'The flop', turn: 'The turn', river: 'The river' };

export function buildReplay(hand: ReplayHand): ReplayStep[] {
  const steps: ReplayStep[] = [];
  const contributed: Record<string, number> = {};
  const inFront: Record<string, number> = {};
  const folded = new Set<string>();
  const allIn = new Set<string>();
  const shown = new Set<string>(['human']);
  const winnings: Record<string, number> = {};
  let street: Street = 'preflop';
  let boardCount = 0;
  const nameOf = (id: string) => hand.players.find((p) => p.id === id)?.name ?? id;
  const isYou = (id: string) => id === 'human';
  // "You check" / "Leo checks".
  const say = (id: string, you: string, them: string) => `${isYou(id) ? 'You' : nameOf(id)} ${isYou(id) ? you : them}`;

  const snapshot = (kind: ReplayStepKind, text: string, extra: Partial<ReplayStep> = {}): ReplayStep => ({
    kind,
    street,
    board: hand.communityCards.slice(0, boardCount),
    pot: Object.values(contributed).reduce((a, b) => a + b, 0) - Object.values(winnings).reduce((a, b) => a + b, 0),
    seats: hand.players.map((p) => {
      const start = hand.startStacks?.[p.id];
      return {
        id: p.id,
        name: p.name,
        holeCards: p.holeCards,
        stack: start == null ? null : start - (contributed[p.id] ?? 0) + (winnings[p.id] ?? 0),
        inFront: inFront[p.id] ?? 0,
        folded: folded.has(p.id),
        allIn: allIn.has(p.id),
        cardsShown: shown.has(p.id),
        isYou: isYou(p.id),
      };
    }),
    text,
    ...extra,
  });

  const put = (id: string, amount: number) => {
    contributed[id] = (contributed[id] ?? 0) + amount;
    inFront[id] = (inFront[id] ?? 0) + amount;
    const start = hand.startStacks?.[id];
    if (start != null && contributed[id] >= start) allIn.add(id);
  };

  const newStreet = (s: Street) => {
    street = s;
    boardCount = BOARD_SIZE[s] ?? boardCount;
    for (const k of Object.keys(inFront)) delete inFront[k];
    const cards = s === 'flop' ? hand.communityCards.slice(0, 3) : hand.communityCards.slice(boardCount - 1, boardCount);
    const pot = Object.values(contributed).reduce((a, b) => a + b, 0);
    steps.push(snapshot('street', `${STREET_NAME[s] ?? s}: ${cardsText(cards)}. The pot is ${money(pot)}.`));
  };

  // 1. The deal and the forced bets (blinds, antes).
  const forced = hand.actionLog.filter((e) => e.forced);
  const posted: Record<string, number> = {};
  for (const e of forced) {
    put(e.playerId, e.amount ?? 0);
    posted[e.playerId] = (posted[e.playerId] ?? 0) + (e.amount ?? 0);
  }
  const blindsText = Object.entries(posted)
    .map(([id, amt]) => `${isYou(id) ? 'you' : nameOf(id)} ${money(amt)}`)
    .join(', ');
  steps.push(snapshot('deal', `Cards are dealt. Forced bets (the blinds) go in: ${blindsText}.`));

  // 2. Every decision, with each new card as it comes.
  let decisionIndex = 0;
  for (const e of hand.actionLog) {
    if (e.forced) continue;
    if (e.street !== street) newStreet(e.street);
    const amt = e.amount ?? 0;
    const id = e.playerId;
    let text: string;
    switch (e.type) {
      case 'fold':
        folded.add(id);
        text = say(id, 'fold.', 'folds.');
        break;
      case 'check':
        text = say(id, 'check.', 'checks.');
        break;
      case 'call':
        put(id, amt);
        text = say(id, `call ${money(amt)}`, `calls ${money(amt)}`) + (allIn.has(id) ? ' — all in.' : '.');
        break;
      case 'bet':
        put(id, amt);
        text = allIn.has(id) ? say(id, `go all in with ${money(amt)}.`, `goes all in with ${money(amt)}.`) : say(id, `bet ${money(amt)}.`, `bets ${money(amt)}.`);
        break;
      default: // raise / all-in
        put(id, amt);
        text = allIn.has(id)
          ? say(id, `go all in — ${money(inFront[id])} in total this round.`, `goes all in — ${money(inFront[id])} in total this round.`)
          : say(id, `raise to ${money(inFront[id])}.`, `raises to ${money(inFront[id])}.`);
    }
    const decision = isYou(id) ? { coach: hand.decisionTimings?.[decisionIndex++]?.coach } : undefined;
    steps.push(snapshot('action', text, { actorId: id, decision }));
  }

  // 3. Cards dealt with no betting left (everyone all in): show the hands, then run the board out.
  const live = hand.players.filter((p) => !folded.has(p.id));
  if (live.length >= 2 && boardCount < hand.communityCards.length) {
    live.forEach((p) => shown.add(p.id));
    steps.push(snapshot('showdown', 'No more betting is possible (players are all in), so the hands are turned face up and the rest of the cards are dealt.'));
    for (const s of ['flop', 'turn', 'river'] as Street[]) {
      if (BOARD_SIZE[s] > boardCount && BOARD_SIZE[s] <= hand.communityCards.length) newStreet(s);
    }
  }

  // 4. The showdown and the result.
  const result = hand.showdownResult;
  if (!result) return steps;
  for (const k of Object.keys(inFront)) delete inFront[k];
  const best = result.bestHandByPlayer ?? {};
  const atShowdown = live.filter((p) => best[p.id]);
  if (atShowdown.length >= 2) {
    atShowdown.forEach((p) => shown.add(p.id));
    const lines = atShowdown.map((p) => `${say(p.id, 'have', 'has')} ${cardsText(p.holeCards)} — ${HAND_RANK_NAMES[best[p.id].rank]}`);
    steps.push(snapshot('showdown', `Showdown: ${lines.join('; ')}.`));
  }
  // Payouts are the pots awarded; refunds are uncalled bets coming back. Both go to the stack.
  for (const [id, amt] of Object.entries(result.payouts)) winnings[id] = (winnings[id] ?? 0) + amt;
  for (const [id, amt] of Object.entries(result.refunds ?? {})) winnings[id] = (winnings[id] ?? 0) + amt;
  const winners = Object.entries(result.payouts)
    .filter(([, amt]) => amt > 0)
    .map(([id, amt]) => {
      const hv = best[id];
      return `${say(id, 'win', 'wins')} ${money(amt)}${hv && atShowdown.length >= 2 ? ` with ${HAND_RANK_NAMES[hv.rank]}` : ''}`;
    });
  const refundText = Object.entries(result.refunds ?? {})
    .filter(([, amt]) => amt > 0)
    .map(([id, amt]) => ` ${money(amt)} nobody called goes back to ${isYou(id) ? 'you' : nameOf(id)}.`)
    .join('');
  const walkover = atShowdown.length < 2;
  steps.push(
    snapshot('result', `${walkover ? 'Everyone else folded. ' : ''}${winners.join('; ') || 'The pot is split'}.${refundText}`),
  );
  return steps;
}
