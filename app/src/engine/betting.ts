export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface PlayerBetState {
  id: string;
  stack: number; // chips not yet committed
  streetContributed: number; // committed during the current street
  totalContributed: number; // committed during the whole hand, across all streets
  folded: boolean;
  allIn: boolean;
}

export interface BettingAction {
  playerId: string;
  type: ActionType;
  amount?: number; // total amount being put in for bet/raise/call/all-in (not a delta)
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
  /** Everyone who put chips into this layer (winners come from eligiblePlayerIds;
   *  payerIds is used to refund a layer no eligible player can win — an uncalled bet). */
  payerIds: string[];
}

/**
 * Splits all contributions from a hand into a main pot and side pots.
 * Folded players' chips still count toward pots but they are not eligible to win any of them.
 */
export function computeSidePots(
  players: { id: string; totalContributed: number; folded: boolean }[],
): Pot[] {
  const contributors = players.filter((p) => p.totalContributed > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((p) => p.totalContributed))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previousLevel = 0;
  for (const level of levels) {
    const slice = level - previousLevel;
    const payers = contributors.filter((p) => p.totalContributed >= level);
    const amount = slice * payers.length;
    if (amount > 0) {
      const eligiblePlayerIds = payers.filter((p) => !p.folded).map((p) => p.id);
      pots.push({ amount, eligiblePlayerIds, payerIds: payers.map((p) => p.id) });
    }
    previousLevel = level;
  }

  return mergePotsWithSameEligibility(pots);
}

function mergePotsWithSameEligibility(pots: Pot[]): Pot[] {
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameMembers(last.eligiblePlayerIds, pot.eligiblePlayerIds)) {
      last.amount += pot.amount;
      last.payerIds = [...new Set([...last.payerIds, ...pot.payerIds])];
    } else {
      merged.push({ ...pot });
    }
  }
  return merged;
}

function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

export interface BettingRoundOptions {
  players: PlayerBetState[];
  actingOrder: string[]; // player ids in the order they act this street
  currentBet: number; // highest streetContributed so far (0 at start of street)
  minRaise: number; // smallest legal raise increment
}

/** Validates and applies a single action, returning the updated state and the amount moved. */
export function applyAction(
  state: PlayerBetState,
  type: ActionType,
  amount: number | undefined,
  currentBet: number,
  minRaise: number,
): { state: PlayerBetState; delta: number } {
  if (state.folded || state.allIn) {
    throw new Error(`Player ${state.id} cannot act: already folded or all-in`);
  }

  switch (type) {
    case 'fold':
      return { state: { ...state, folded: true }, delta: 0 };

    case 'check': {
      if (currentBet > state.streetContributed) {
        throw new Error('Cannot check when facing a bet');
      }
      return { state, delta: 0 };
    }

    case 'call': {
      const owed = currentBet - state.streetContributed;
      if (owed <= 0) throw new Error('Nothing to call');
      const delta = Math.min(owed, state.stack);
      const next: PlayerBetState = {
        ...state,
        stack: state.stack - delta,
        streetContributed: state.streetContributed + delta,
        totalContributed: state.totalContributed + delta,
        allIn: delta === state.stack,
      };
      return { state: next, delta };
    }

    case 'bet': {
      if (currentBet > 0) throw new Error('Cannot bet when there is already a bet; use raise');
      if (!amount || amount <= 0) throw new Error('Bet amount must be positive');
      const delta = Math.min(amount, state.stack);
      const next: PlayerBetState = {
        ...state,
        stack: state.stack - delta,
        streetContributed: state.streetContributed + delta,
        totalContributed: state.totalContributed + delta,
        allIn: delta === state.stack,
      };
      return { state: next, delta };
    }

    case 'raise': {
      if (!amount) throw new Error('Raise amount must be specified');
      const totalToCommitThisStreet = amount;
      const raiseSize = totalToCommitThisStreet - currentBet;
      const delta = totalToCommitThisStreet - state.streetContributed;
      const isAllIn = delta >= state.stack;
      if (!isAllIn && raiseSize < minRaise) {
        throw new Error(`Raise must be at least ${minRaise}`);
      }
      const actualDelta = Math.min(delta, state.stack);
      const next: PlayerBetState = {
        ...state,
        stack: state.stack - actualDelta,
        streetContributed: state.streetContributed + actualDelta,
        totalContributed: state.totalContributed + actualDelta,
        allIn: actualDelta === state.stack,
      };
      return { state: next, delta: actualDelta };
    }

    case 'all-in': {
      const delta = state.stack;
      const next: PlayerBetState = {
        ...state,
        stack: 0,
        streetContributed: state.streetContributed + delta,
        totalContributed: state.totalContributed + delta,
        allIn: true,
      };
      return { state: next, delta };
    }
  }
}

/** Returns true once no further action is needed on the current street. */
export function isBettingRoundComplete(
  players: PlayerBetState[],
  lastAggressorId: string | null,
  actedPlayerIds: Set<string>,
): boolean {
  const live = players.filter((p) => !p.folded && !p.allIn);
  if (live.length <= 1) return true;

  const currentBet = Math.max(...players.filter((p) => !p.folded).map((p) => p.streetContributed));
  const allMatched = live.every((p) => p.streetContributed === currentBet);
  const allActed = live.every((p) => actedPlayerIds.has(p.id));

  if (!allMatched || !allActed) return false;
  if (lastAggressorId && !actedPlayerIds.has(lastAggressorId)) return false;
  return true;
}
