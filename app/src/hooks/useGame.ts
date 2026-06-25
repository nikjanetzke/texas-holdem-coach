import { useCallback, useEffect, useRef, useState } from 'react';
import { HandEngine } from '../engine/game';
import type { ActionType } from '../engine/betting';
import { decideAIAction } from '../ai/decide';
import { AI_ARCHETYPES } from '../ai/profiles';
import type { AIProfile } from '../ai/profiles';
import { classifyPosition, generateAdvice, LeakTracker, scoreDecision } from '../coach/coach';
import type { CoachAdvice } from '../coach/coach';

export interface SeatConfig {
  id: string;
  name: string;
  isHuman: boolean;
  profile?: AIProfile;
}

export interface GameSetup {
  seats: SeatConfig[];
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface HandSummaryEntry {
  playerId: string;
  score: number;
  explanation: string;
}

const ARCHETYPE_LIST = [AI_ARCHETYPES.tight, AI_ARCHETYPES.looseAggressive, AI_ARCHETYPES.callingStation];

export function buildDefaultSeats(numPlayers: number): SeatConfig[] {
  const seats: SeatConfig[] = [{ id: 'human', name: 'You', isHuman: true }];
  for (let i = 1; i < numPlayers; i++) {
    const profile = ARCHETYPE_LIST[(i - 1) % ARCHETYPE_LIST.length];
    seats.push({ id: `ai-${i}`, name: `${profile.name} ${i}`, isHuman: false, profile });
  }
  return seats;
}

export function useGame(setup: GameSetup) {
  const [stacks, setStacks] = useState<Record<string, number>>(
    () => Object.fromEntries(setup.seats.map((s) => [s.id, setup.startingStack])),
  );
  const [dealerSeat, setDealerSeat] = useState(0);
  const [handNumber, setHandNumber] = useState(1);
  const [engine, setEngine] = useState<HandEngine | null>(null);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [handSummary, setHandSummary] = useState<HandSummaryEntry[] | null>(null);
  const leakTracker = useRef(new LeakTracker());
  const [, forceRender] = useState(0);

  const startHand = useCallback((dealer: number) => {
    const activeSeats = setup.seats.filter((s) => stacks[s.id] > 0);
    if (activeSeats.length < 2) return;
    const newEngine = new HandEngine({
      players: setup.seats.map((s) => ({ id: s.id, name: s.name, stack: stacks[s.id] })),
      dealerSeat: dealer,
      smallBlind: setup.smallBlind,
      bigBlind: setup.bigBlind,
    });
    setEngine(newEngine);
    setHandSummary(null);
    setAdvice(null);
  }, [setup, stacks]);

  useEffect(() => {
    startHand(dealerSeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const potTotal = engine ? engine.players.reduce((sum, p) => sum + p.totalContributed, 0) : 0;

  const seatConfigById = Object.fromEntries(setup.seats.map((s) => [s.id, s]));

  const currentActorId = engine?.getCurrentActorId() ?? null;

  const computeAdviceForHuman = useCallback(() => {
    if (!engine || !currentActorId || currentActorId !== 'human') {
      setAdvice(null);
      return;
    }
    const player = engine.players.find((p) => p.id === 'human')!;
    const valid = engine.getValidActions('human');
    const numOpponents = engine.players.filter((p) => !p.folded && !p.sittingOut && p.id !== 'human').length;
    const seatIndexInOrder = engine.actingOrder.findIndex((seatIdx) => engine.players[seatIdx].id === 'human');
    const position = classifyPosition(seatIndexInOrder, engine.actingOrder.length, false, false);
    const result = generateAdvice({
      holeCards: player.holeCards,
      communityCards: engine.communityCards,
      numOpponents: Math.max(1, numOpponents),
      potBeforeAction: potTotal - player.streetContributed,
      amountToCall: valid.callAmount,
      position,
    });
    setAdvice(result);
  }, [engine, currentActorId, potTotal, setup.seats, stacks]);

  useEffect(() => {
    computeAdviceForHuman();
  }, [computeAdviceForHuman]);

  // Drive AI turns automatically.
  useEffect(() => {
    if (!engine || engine.isHandOver()) return;
    const actorId = engine.getCurrentActorId();
    if (!actorId || actorId === 'human') return;
    const seat = seatConfigById[actorId];
    if (!seat || !seat.profile) return;

    const timer = setTimeout(() => {
      const player = engine.players.find((p) => p.id === actorId)!;
      const valid = engine.getValidActions(actorId);
      const numOpponents = engine.players.filter((p) => !p.folded && !p.sittingOut && p.id !== actorId).length;
      const decision = decideAIAction({
        holeCards: player.holeCards,
        communityCards: engine.communityCards,
        numOpponents: Math.max(1, numOpponents),
        potBeforeAction: potTotal - player.streetContributed,
        amountToCall: valid.callAmount,
        stack: player.stack,
        currentBet: engine.currentBet,
        minRaiseTo: valid.minRaiseTo,
        validActions: valid.types,
        profile: seat.profile!,
      });
      try {
        engine.act(actorId, decision.type, decision.amount);
      } catch {
        engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
      }
      forceRender((n) => n + 1);
    }, 500);

    return () => clearTimeout(timer);
  }, [engine, potTotal, seatConfigById]);

  // When a hand reaches showdown, settle stacks and build the review.
  useEffect(() => {
    if (!engine || !engine.isHandOver() || handSummary) return;
    const newStacks: Record<string, number> = {};
    for (const p of engine.players) newStacks[p.id] = p.stack;
    setStacks((prev) => ({ ...prev, ...newStacks }));
    setHandSummary([]);
  }, [engine, handSummary]);

  const humanAct = useCallback((type: ActionType, amount?: number) => {
    if (!engine || currentActorId !== 'human') return;
    const player = engine.players.find((p) => p.id === 'human')!;
    const valid = engine.getValidActions('human');
    if (advice) {
      const result = scoreDecision({
        actualAction: type,
        suggestedAction: advice.suggestedAction,
        equityPercent: advice.equityPercent,
        potOddsPercent: advice.potOddsPercent,
        position: advice.position,
      });
      leakTracker.current.record({
        actualAction: type,
        suggestedAction: advice.suggestedAction,
        equityPercent: advice.equityPercent,
        potOddsPercent: advice.potOddsPercent,
        position: advice.position,
      });
      setHandSummary((prev) => [...(prev ?? []), { playerId: 'human', score: result.score, explanation: result.explanation }]);
    }
    engine.act('human', type, amount ?? (type === 'call' ? valid.callAmount + player.streetContributed : undefined));
    forceRender((n) => n + 1);
  }, [engine, currentActorId, advice]);

  const nextHand = useCallback(() => {
    const nextDealer = (dealerSeat + 1) % setup.seats.length;
    setDealerSeat(nextDealer);
    setHandNumber((n) => n + 1);
    startHand(nextDealer);
  }, [dealerSeat, setup.seats.length, startHand]);

  return {
    engine,
    potTotal,
    currentActorId,
    advice,
    handSummary,
    handNumber,
    leakTracker: leakTracker.current,
    humanAct,
    nextHand,
    stacks,
  };
}
