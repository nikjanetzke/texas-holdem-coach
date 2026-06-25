import type { Card } from './deck';
import { Shoe } from './deck';
import type { HandValue } from './evaluator';
import { compareHandValues, evaluateBestHand } from './evaluator';
import type { ActionType, Pot } from './betting';
import { applyAction, computeSidePots, isBettingRoundComplete } from './betting';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface HandPlayer {
  id: string;
  name: string;
  stack: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  streetContributed: number;
  totalContributed: number;
  sittingOut: boolean; // not dealt in, e.g. busted or stepped away
}

export interface ActionLogEntry {
  street: Street;
  playerId: string;
  type: ActionType;
  amount?: number;
}

export interface ShowdownResult {
  pots: Pot[];
  payouts: Record<string, number>; // playerId -> amount won
  bestHandByPlayer: Record<string, HandValue>;
}

export interface HandEngineOptions {
  players: { id: string; name: string; stack: number }[];
  dealerSeat: number; // index into players array
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  rng?: () => number;
}

export class HandEngine {
  players: HandPlayer[];
  dealerSeat: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  street: Street = 'preflop';
  communityCards: Card[] = [];
  currentBet = 0;
  minRaise: number;
  actingOrder: number[] = [];
  actorPointer = 0;
  lastAggressorId: string | null = null;
  actedPlayerIds = new Set<string>();
  actionLog: ActionLogEntry[] = [];
  showdownResult: ShowdownResult | null = null;
  smallBlindId: string | null = null;
  bigBlindId: string | null = null;
  private shoe: Shoe;

  constructor(options: HandEngineOptions) {
    this.players = options.players.map((p) => ({
      ...p,
      holeCards: [],
      folded: false,
      allIn: p.stack === 0,
      streetContributed: 0,
      totalContributed: 0,
      sittingOut: p.stack === 0,
    }));
    this.dealerSeat = options.dealerSeat;
    this.smallBlind = options.smallBlind;
    this.bigBlind = options.bigBlind;
    this.ante = options.ante ?? 0;
    this.minRaise = options.bigBlind;
    this.shoe = new Shoe(options.rng);
    this.dealAndPostBlinds();
  }

  private activeSeats(): number[] {
    const seats: number[] = [];
    for (let i = 0; i < this.players.length; i++) {
      if (!this.players[i].sittingOut) seats.push(i);
    }
    return seats;
  }

  private nextSeat(from: number): number {
    const n = this.players.length;
    let i = (from + 1) % n;
    while (this.players[i].sittingOut) {
      i = (i + 1) % n;
    }
    return i;
  }

  private dealAndPostBlinds(): void {
    const active = this.activeSeats();
    for (let i = 0; i < 2; i++) {
      for (const seat of active) {
        this.players[seat].holeCards.push(this.shoe.draw());
      }
    }

    // Antes are dead money: they go to the pot (totalContributed) but do not count
    // toward matching the current bet (streetContributed stays untouched).
    if (this.ante > 0) {
      for (const seat of active) {
        const player = this.players[seat];
        const delta = Math.min(this.ante, player.stack);
        if (delta <= 0) continue;
        player.stack -= delta;
        player.totalContributed += delta;
        player.allIn = player.stack === 0;
        this.actionLog.push({ street: 'preflop', playerId: player.id, type: 'bet', amount: delta });
      }
    }

    if (active.length === 2) {
      // Heads-up: dealer posts small blind, other player posts big blind.
      this.postBlind(this.dealerSeat, this.smallBlind);
      const bbSeat = this.nextSeat(this.dealerSeat);
      this.postBlind(bbSeat, this.bigBlind);
      this.smallBlindId = this.players[this.dealerSeat].id;
      this.bigBlindId = this.players[bbSeat].id;
      this.actingOrder = [this.dealerSeat, bbSeat];
    } else {
      const sbSeat = this.nextSeat(this.dealerSeat);
      const bbSeat = this.nextSeat(sbSeat);
      this.postBlind(sbSeat, this.smallBlind);
      this.postBlind(bbSeat, this.bigBlind);
      this.smallBlindId = this.players[sbSeat].id;
      this.bigBlindId = this.players[bbSeat].id;

      const order: number[] = [];
      let seat = this.nextSeat(bbSeat);
      for (let i = 0; i < active.length; i++) {
        order.push(seat);
        seat = this.nextSeat(seat);
      }
      this.actingOrder = order;
    }

    this.currentBet = this.bigBlind;
    this.actorPointer = 0;
    this.actedPlayerIds = new Set();
    // The big blind is the effective last aggressor preflop (everyone must act to match it).
    this.lastAggressorId =
      active.length === 2
        ? this.players[this.nextSeat(this.dealerSeat)].id
        : this.players[this.nextSeat(this.nextSeat(this.dealerSeat))].id;
  }

  private postBlind(seat: number, amount: number): void {
    const player = this.players[seat];
    const delta = Math.min(amount, player.stack);
    player.stack -= delta;
    player.streetContributed += delta;
    player.totalContributed += delta;
    player.allIn = player.stack === 0;
    this.actionLog.push({ street: 'preflop', playerId: player.id, type: 'bet', amount: delta });
  }

  getCurrentActorId(): string | null {
    if (this.isHandOver()) return null;
    for (let i = 0; i < this.actingOrder.length; i++) {
      const seat = this.actingOrder[(this.actorPointer + i) % this.actingOrder.length];
      const p = this.players[seat];
      if (!p.folded && !p.allIn) return p.id;
    }
    return null;
  }

  getValidActions(playerId: string): { types: ActionType[]; callAmount: number; minRaiseTo: number; maxRaiseTo: number } {
    const player = this.requirePlayer(playerId);
    const owed = this.currentBet - player.streetContributed;
    const types: ActionType[] = ['fold'];
    if (owed <= 0) {
      types.push('check');
      if (player.stack > 0) types.push('bet');
    } else {
      if (player.stack > owed) types.push('call');
      if (player.stack > 0) types.push('raise');
    }
    return {
      types,
      callAmount: Math.min(owed, player.stack),
      minRaiseTo: this.currentBet + this.minRaise,
      maxRaiseTo: player.streetContributed + player.stack,
    };
  }

  act(playerId: string, type: ActionType, amount?: number): void {
    const seatIndex = this.players.findIndex((p) => p.id === playerId);
    const player = this.players[seatIndex];
    if (!player) throw new Error(`Unknown player ${playerId}`);
    if (this.getCurrentActorId() !== playerId) {
      throw new Error(`It is not ${playerId}'s turn to act`);
    }

    const previousCurrentBet = this.currentBet;
    const { state, delta } = applyAction(
      { id: player.id, stack: player.stack, streetContributed: player.streetContributed, totalContributed: player.totalContributed, folded: player.folded, allIn: player.allIn },
      type,
      amount,
      this.currentBet,
      this.minRaise,
    );

    player.stack = state.stack;
    player.streetContributed = state.streetContributed;
    player.totalContributed = state.totalContributed;
    player.folded = state.folded;
    player.allIn = state.allIn;

    this.actionLog.push({ street: this.street, playerId, type, amount: delta || amount });
    this.actedPlayerIds.add(playerId);

    // Any action (bet, raise, or an all-in that exceeds the current bet) that raises the
    // amount others must match reopens the action for everyone else.
    if (player.streetContributed > previousCurrentBet) {
      const newRaiseSize = player.streetContributed - previousCurrentBet;
      this.minRaise = Math.max(this.minRaise, newRaiseSize);
      this.lastAggressorId = playerId;
      this.actedPlayerIds = new Set([playerId]);
      this.currentBet = player.streetContributed;
    }

    this.advance();
  }

  private liveNonFolded(): HandPlayer[] {
    return this.players.filter((p) => !p.sittingOut && !p.folded);
  }

  private advance(): void {
    const live = this.liveNonFolded();
    if (live.length <= 1) {
      this.runShowdown();
      return;
    }

    const stillToAct = live.filter((p) => !p.allIn);
    const roundComplete = isBettingRoundComplete(
      stillToAct.map((p) => ({ id: p.id, stack: p.stack, streetContributed: p.streetContributed, totalContributed: p.totalContributed, folded: p.folded, allIn: p.allIn })),
      this.lastAggressorId,
      this.actedPlayerIds,
    ) || stillToAct.length === 0;

    if (roundComplete) {
      this.moveToNextStreet();
      return;
    }

    this.actorPointer = (this.actorPointer + 1) % this.actingOrder.length;
    while (this.players[this.actingOrder[this.actorPointer]].folded || this.players[this.actingOrder[this.actorPointer]].allIn) {
      this.actorPointer = (this.actorPointer + 1) % this.actingOrder.length;
    }
  }

  private moveToNextStreet(): void {
    for (const p of this.players) p.streetContributed = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.actedPlayerIds = new Set();
    this.lastAggressorId = null;

    const live = this.liveNonFolded();
    const allInOrFoldedExceptOne = live.filter((p) => !p.allIn).length <= 1;

    if (this.street === 'river' || (allInOrFoldedExceptOne && live.length > 1 && this.street !== 'preflop')) {
      if (this.street !== 'river') this.dealRemainingBoardAndShowdown();
      else this.runShowdown();
      return;
    }
    if (allInOrFoldedExceptOne && this.street === 'preflop') {
      this.dealRemainingBoardAndShowdown();
      return;
    }

    this.street = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
    this.dealCommunityForStreet();

    const active = this.activeSeats();
    const order: number[] = [];
    let seat = active.length === 2 ? this.nextSeat(this.dealerSeat) : this.nextSeat(this.dealerSeat);
    // Postflop action starts with the first active player left of the dealer.
    for (let i = 0; i < active.length; i++) {
      order.push(seat);
      seat = this.nextSeat(seat);
    }
    this.actingOrder = order;
    this.actorPointer = 0;
    while (this.players[this.actingOrder[this.actorPointer]].folded || this.players[this.actingOrder[this.actorPointer]].allIn) {
      this.actorPointer = (this.actorPointer + 1) % this.actingOrder.length;
      if (this.actorPointer === 0) break;
    }
  }

  private dealCommunityForStreet(): void {
    if (this.street === 'flop') {
      this.communityCards.push(this.shoe.draw(), this.shoe.draw(), this.shoe.draw());
    } else {
      this.communityCards.push(this.shoe.draw());
    }
  }

  private dealRemainingBoardAndShowdown(): void {
    while (this.communityCards.length < 5) {
      this.communityCards.push(this.shoe.draw());
    }
    this.runShowdown();
  }

  isHandOver(): boolean {
    return this.street === 'showdown';
  }

  private requirePlayer(playerId: string): HandPlayer {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`Unknown player ${playerId}`);
    return player;
  }

  private runShowdown(): void {
    this.street = 'showdown';
    const pots = computeSidePots(this.players.filter((p) => !p.sittingOut || p.totalContributed > 0).map((p) => ({ id: p.id, totalContributed: p.totalContributed, folded: p.folded })));

    const live = this.liveNonFolded();
    const bestHandByPlayer: Record<string, HandValue> = {};
    // Only evaluate hands when there's an actual showdown; a walkover winner needs no eval.
    if (live.length > 1) {
      for (const p of live) {
        bestHandByPlayer[p.id] = evaluateBestHand([...p.holeCards, ...this.communityCards]);
      }
    }

    const payouts: Record<string, number> = {};
    for (const pot of pots) {
      const contenders = pot.eligiblePlayerIds;
      if (contenders.length === 0) continue;
      let winners: string[];
      if (live.length === 1) {
        winners = [live[0].id];
      } else {
        winners = [contenders[0]];
        for (const id of contenders.slice(1)) {
          const cmp = compareHandValues(bestHandByPlayer[id], bestHandByPlayer[winners[0]]);
          if (cmp > 0) winners = [id];
          else if (cmp === 0) winners.push(id);
        }
      }
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const id of winners) {
        payouts[id] = (payouts[id] ?? 0) + share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      }
    }

    for (const p of this.players) {
      if (payouts[p.id]) p.stack += payouts[p.id];
    }

    this.showdownResult = { pots, payouts, bestHandByPlayer };
  }
}
