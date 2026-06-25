import { useCallback, useEffect, useRef, useState } from 'react';
import { HandEngine } from '../engine/game';
import type { ActionLogEntry, HandPlayer, ShowdownResult, Street } from '../engine/game';
import type { Card } from '../engine/deck';
import type { ActionType } from '../engine/betting';
import { decideAIAction } from '../ai/decide';
import { AI_ARCHETYPES } from '../ai/profiles';
import type { AIProfile } from '../ai/profiles';
import { classifyPosition, generateAdvice, LeakTracker, scoreDecision } from '../coach/coach';
import type { CoachAdvice, Leak } from '../coach/coach';
import { loadSession, saveSession } from '../persistence/storage';

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
  thinkMs: number;
}

// One human decision's think-time and the context it was made in, captured for
// the post-hand review, the export, and (later) consistency analysis.
export interface DecisionTiming {
  street: Street;
  action: ActionType;
  thinkMs: number;
  equityPercent: number | null;
  potOddsPercent: number | null;
}

export interface HandRecord {
  handNumber: number;
  dealerSeat: number;
  players: { id: string; name: string; holeCards: Card[] }[];
  communityCards: Card[];
  actionLog: ActionLogEntry[];
  showdownResult: ShowdownResult | null;
  decisionTimings: DecisionTiming[];
}

const ARCHETYPE_LIST = [AI_ARCHETYPES.tight, AI_ARCHETYPES.looseAggressive, AI_ARCHETYPES.callingStation];
const MAX_HAND_HISTORY = 20;

export function buildDefaultSeats(numPlayers: number): SeatConfig[] {
  const seats: SeatConfig[] = [{ id: 'human', name: 'You', isHuman: true }];
  for (let i = 1; i < numPlayers; i++) {
    const profile = ARCHETYPE_LIST[(i - 1) % ARCHETYPE_LIST.length];
    seats.push({ id: `ai-${i}`, name: `${profile.name} ${i}`, isHuman: false, profile });
  }
  return seats;
}

interface SavedSession {
  stacks: Record<string, number>;
  dealerSeat: number;
  handNumber: number;
  leakCounts: { counts: Record<Leak, number>; totalDecisions: number };
  handHistory: HandRecord[];
  coachEnabled: boolean;
}

// Bots act after a random delay in this range so the table doesn't feel robotic
// and a human player can't infer anything from a fixed AI response time.
const BOT_DELAY_MIN_MS = 400;
const BOT_DELAY_MAX_MS = 1600;

function sessionKey(setup: GameSetup): string {
  return setup.seats.map((s) => s.id).join(',');
}

export function useGame(setup: GameSetup) {
  // Only restore a saved session if it matches the current set of seats.
  const initialSaved = (() => {
    const saved = loadSession<SavedSession & { seatKey: string }>();
    if (saved && saved.seatKey === sessionKey(setup)) return saved;
    return null;
  })();

  const [stacks, setStacks] = useState<Record<string, number>>(
    () => initialSaved?.stacks ?? Object.fromEntries(setup.seats.map((s) => [s.id, setup.startingStack])),
  );
  const [dealerSeat, setDealerSeat] = useState(initialSaved?.dealerSeat ?? 0);
  const [handNumber, setHandNumber] = useState(initialSaved?.handNumber ?? 1);
  const [engine, setEngine] = useState<HandEngine | null>(null);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [handSummary, setHandSummary] = useState<HandSummaryEntry[] | null>(null);
  const [handHistory, setHandHistory] = useState<HandRecord[]>(initialSaved?.handHistory ?? []);
  const [coachEnabled, setCoachEnabled] = useState(initialSaved?.coachEnabled ?? true);
  const leakTracker = useRef(LeakTracker.fromJSON(initialSaved?.leakCounts));
  const [, forceRender] = useState(0);

  // Think-time tracking: when the human's turn begins we stamp a start time, and
  // each decision's elapsed time is collected per hand for the review and export.
  const turnStartRef = useRef<number | null>(null);
  const currentHandTimingsRef = useRef<DecisionTiming[]>([]);

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
    currentHandTimingsRef.current = [];
    turnStartRef.current = null;
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

  // Start the think-time clock the moment it becomes the human's turn to act.
  useEffect(() => {
    if (currentActorId === 'human' && !engine?.isHandOver()) {
      turnStartRef.current = performance.now();
    }
  }, [currentActorId, engine]);

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
    }, BOT_DELAY_MIN_MS + Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));

    return () => clearTimeout(timer);
  }, [engine, potTotal, seatConfigById]);

  // When a hand reaches showdown, settle stacks and record history exactly once.
  // This runs on every render (no dep array) because `engine` mutates in place and
  // `forceRender` ticks don't change any dependency the effect could key off of —
  // the settledEngineRef guard is what makes this idempotent.
  const settledEngineRef = useRef<HandEngine | null>(null);
  useEffect(() => {
    if (!engine || !engine.isHandOver() || settledEngineRef.current === engine) return;
    settledEngineRef.current = engine;

    const newStacks: Record<string, number> = {};
    for (const p of engine.players) newStacks[p.id] = p.stack;
    setStacks((prev) => ({ ...prev, ...newStacks }));
    setHandSummary((prev) => prev ?? []);

    const record: HandRecord = {
      handNumber,
      dealerSeat,
      players: engine.players.map((p: HandPlayer) => ({ id: p.id, name: p.name, holeCards: p.holeCards })),
      communityCards: engine.communityCards,
      actionLog: engine.actionLog,
      showdownResult: engine.showdownResult,
      decisionTimings: [...currentHandTimingsRef.current],
    };
    setHandHistory((prev) => [record, ...prev].slice(0, MAX_HAND_HISTORY));
  });

  // Persist session state to localStorage whenever it changes meaningfully.
  useEffect(() => {
    saveSession<SavedSession & { seatKey: string }>({
      seatKey: sessionKey(setup),
      stacks,
      dealerSeat,
      handNumber,
      leakCounts: leakTracker.current.toJSON(),
      handHistory,
      coachEnabled,
    });
  }, [setup, stacks, dealerSeat, handNumber, handHistory, coachEnabled]);

  const humanAct = useCallback((type: ActionType, amount?: number) => {
    if (!engine || currentActorId !== 'human') return;
    const player = engine.players.find((p) => p.id === 'human')!;
    const valid = engine.getValidActions('human');
    const thinkMs = turnStartRef.current != null ? Math.round(performance.now() - turnStartRef.current) : 0;
    turnStartRef.current = null;

    currentHandTimingsRef.current.push({
      street: engine.street,
      action: type,
      thinkMs,
      equityPercent: advice?.equityPercent ?? null,
      potOddsPercent: advice?.potOddsPercent ?? null,
    });

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
      setHandSummary((prev) => [...(prev ?? []), { playerId: 'human', score: result.score, explanation: result.explanation, thinkMs }]);
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
    handHistory,
    coachEnabled,
    setCoachEnabled,
  };
}
