// Headless bot-only table for tests: plays hands between the real characters
// with the real AI, and returns what a player at the table would have seen.
import { decideAIAction } from '../../ai/decide';
import { CHARACTERS } from '../../ai/characters';
import type { AIProfile } from '../../ai/profiles';
import { HandEngine } from '../../engine/game';
import type { ActionLogEntry, ShowdownResult } from '../../engine/game';
import type { Card } from '../../engine/deck';

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimHand {
  players: { id: string; name: string; holeCards: Card[] }[];
  communityCards: Card[];
  actionLog: ActionLogEntry[];
  showdownResult: ShowdownResult | null;
  startStacks: Record<string, number>;
  finalStacks: Record<string, number>;
  bigBlind: number;
  dealerSeat: number;
}

export function botAct(engine: HandEngine, actorId: string, profile: AIProfile, rng: () => number): void {
  const player = engine.players.find((p) => p.id === actorId)!;
  const valid = engine.getValidActions(actorId);
  const live = engine.actingOrder.filter((si) => !engine.players[si].folded);
  const posIdx = live.findIndex((si) => engine.players[si].id === actorId);
  const potTotal = engine.players.reduce((sum, p) => sum + p.totalContributed, 0);
  const d = decideAIAction({
    holeCards: player.holeCards,
    communityCards: engine.communityCards,
    numOpponents: Math.max(1, engine.players.filter((p) => !p.folded && p.id !== actorId).length),
    potBeforeAction: potTotal - player.streetContributed,
    amountToCall: valid.callAmount,
    stack: player.stack,
    currentBet: engine.currentBet,
    minRaiseTo: valid.minRaiseTo,
    validActions: valid.types,
    profile,
    positionFraction: live.length > 1 && posIdx >= 0 ? posIdx / (live.length - 1) : 0.5,
    bigBlind: engine.bigBlind,
    rng,
  });
  try {
    engine.act(actorId, d.type, d.amount);
  } catch {
    engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
  }
}

/** Plays `hands` hands between the given characters (rebuying anyone who busts). */
export function simulate(characterIds: string[], hands: number, seed = 1): SimHand[] {
  const rng = seeded(seed);
  const profiles = characterIds.map((id) => CHARACTERS.find((c) => c.id === id)!);
  const stacks: Record<string, number> = Object.fromEntries(profiles.map((p) => [p.id, 5000]));
  const out: SimHand[] = [];
  for (let h = 0; h < hands; h++) {
    for (const p of profiles) if (stacks[p.id] < 100) stacks[p.id] = 5000;
    const dealerSeat = h % profiles.length;
    const startStacks = { ...stacks };
    const engine = new HandEngine({
      players: profiles.map((p) => ({ id: p.id, name: p.shortName, stack: stacks[p.id] })),
      dealerSeat,
      smallBlind: 25,
      bigBlind: 50,
      rng,
    });
    for (let guard = 0; guard < 200 && !engine.isHandOver(); guard++) {
      const actor = engine.getCurrentActorId();
      if (!actor) break;
      botAct(engine, actor, profiles.find((p) => p.id === actor)!, rng);
    }
    for (const p of engine.players) stacks[p.id] = p.stack;
    out.push({
      players: engine.players.map((p) => ({ id: p.id, name: p.name, holeCards: p.holeCards })),
      communityCards: engine.communityCards,
      actionLog: engine.actionLog,
      showdownResult: engine.showdownResult,
      startStacks,
      finalStacks: { ...stacks },
      bigBlind: 50,
      dealerSeat,
    });
  }
  return out;
}
