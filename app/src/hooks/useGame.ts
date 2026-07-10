import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandEngine } from '../engine/game';
import type { ActionLogEntry, HandPlayer, ShowdownResult, Street } from '../engine/game';
import type { Card } from '../engine/deck';
import type { ActionType } from '../engine/betting';
import { decideAIAction } from '../ai/decide';
import type { AIProfile } from '../ai/profiles';
import { CHARACTERS } from '../ai/characters';
import { classifyPosition, generateAdvice, LeakTracker, scoreDecision } from '../coach/coach';
import type { CoachAdvice, Leak } from '../coach/coach';
import { loadSession, saveSession } from '../persistence/storage';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID, levelAt } from '../engine/blinds';
import type { BlindLevel } from '../engine/blinds';
import type { LuckBand } from '../engine/preflop';

export interface SeatConfig {
  id: string;
  name: string;
  isHuman: boolean;
  profile?: AIProfile;
  portrait?: string; // avatar image; for the human seat (AI seats use profile.portrait)
  stack?: number; // overrides startingStack for this seat (scenarios)
}

export interface GameSetup {
  seats: SeatConfig[];
  startingStack: number;
  scheduleId: string;
  cardLuck?: LuckBand; // bias the human's starting hands (scenarios)
  scenarioName?: string;
  scenarioId?: string; // keys the in-game strategy guide (📖) to the right scenario
  /** Seconds the human has to act before auto-folding (or auto-checking if free). Undefined/0 = no timer. */
  actionTimerSeconds?: number;
  /** Starting preferences chosen on the setup screen. Defaults: coach off, speech off, auto-advance on. */
  coachDefault?: boolean;
  speechDefault?: boolean;
  autoAdvanceDefault?: boolean;
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

const MAX_HAND_HISTORY = 20;

// Pick a fresh, shuffled subset of the character roster each game so the table
// feels different but every opponent is one of the recurring named personalities.
// The human plays as this character's face (kept out of the opponent pool).
export const PLAYER_AVATAR = '/avatars/rookie.jpg';

export function buildDefaultSeats(numPlayers: number): SeatConfig[] {
  const seats: SeatConfig[] = [{ id: 'human', name: 'You', isHuman: true, portrait: PLAYER_AVATAR }];
  const roster = CHARACTERS.filter((c) => c.portrait !== PLAYER_AVATAR).sort(() => Math.random() - 0.5);
  for (let i = 1; i < numPlayers; i++) {
    const profile = roster[(i - 1) % roster.length];
    seats.push({ id: profile.id, name: profile.shortName, isHuman: false, profile });
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
  levelIndex: number;
}

// Bots act after a random delay in this range so the table doesn't feel robotic
// and a human player can't infer anything from a fixed AI response time.
const BOT_DELAY_MIN_MS = 800;
const BOT_DELAY_MAX_MS = 3200;

function sessionKey(setup: GameSetup): string {
  return setup.seats.map((s) => s.id).join(',');
}

// Only restore a saved session if it matches the current set of seats AND it
// still has at least 2 solvent players. Without the second check, a finished
// game's leftover session (e.g. the human busted to 0) could be silently
// reused when the same setup is started again — since scenarios use
// deterministic seat ids (e.g. "ai-1"), replaying a scenario after busting
// would restore the dead table and the game would end instantly with no
// hands played, looking like an immediate/bogus win or loss.
// Exported so this restore rule can be unit-tested without mounting the hook.
export function pickRestorableSession(
  saved: (SavedSession & { seatKey: string }) | null,
  setup: GameSetup,
): (SavedSession & { seatKey: string }) | null {
  if (!saved || saved.seatKey !== sessionKey(setup)) return null;
  const activeCount = setup.seats.filter((s) => (saved.stacks[s.id] ?? 0) > 0).length;
  if (activeCount < 2) return null;
  return saved;
}

export function useGame(setup: GameSetup) {
  const initialSaved = pickRestorableSession(loadSession<SavedSession & { seatKey: string }>(), setup);

  const [stacks, setStacks] = useState<Record<string, number>>(
    () => initialSaved?.stacks ?? Object.fromEntries(setup.seats.map((s) => [s.id, s.stack ?? setup.startingStack])),
  );
  // Always-current mirror of `stacks`. The settle effect writes credited stacks
  // here synchronously (before the async setStacks re-render) so that when
  // nextHand -> startHand runs in the same tick it reads the real post-win
  // stacks, not a stale render closure. This is the fix for winnings that
  // "didn't get added on" after an all-in.
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
  const [dealerSeat, setDealerSeat] = useState(initialSaved?.dealerSeat ?? 0);
  const [handNumber, setHandNumber] = useState(initialSaved?.handNumber ?? 1);
  const [engine, setEngine] = useState<HandEngine | null>(null);
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);
  const [handSummary, setHandSummary] = useState<HandSummaryEntry[] | null>(null);
  const [handHistory, setHandHistory] = useState<HandRecord[]>(initialSaved?.handHistory ?? []);
  const [coachEnabled, setCoachEnabled] = useState(initialSaved?.coachEnabled ?? setup.coachDefault ?? false);
  // Pre-press: a fold/check/call the human queued before it was their turn.
  // When their turn arrives it auto-executes if still legal, else is discarded.
  const [queuedAction, setQueuedAction] = useState<ActionType | null>(null);
  const leakTracker = useRef(LeakTracker.fromJSON(initialSaved?.leakCounts));
  const [, forceRender] = useState(0);

  // Tournament blind clock. The level index persists across reloads, but the level
  // timer restarts on load so time away from the table doesn't fast-forward blinds.
  const schedule = BLIND_SCHEDULES[setup.scheduleId] ?? BLIND_SCHEDULES[DEFAULT_SCHEDULE_ID];
  const [levelIndex, setLevelIndex] = useState(initialSaved?.levelIndex ?? 0);
  // Mirror the level index in a ref so startHand always reads the latest level,
  // even when called in the same event tick that just advanced it.
  const levelIndexRef = useRef(levelIndex);
  const levelMs = schedule.defaultLevelMinutes * 60 * 1000;
  const levelStartedAtRef = useRef<number>(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());
  const currentLevel: BlindLevel = levelAt(schedule, levelIndex);
  const isLastLevel = levelIndex >= schedule.levels.length - 1;
  const msLeftInLevel = isLastLevel ? Infinity : Math.max(0, levelMs - (nowTick - levelStartedAtRef.current));

  // Tick once a second so the clock display updates.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Think-time tracking: when the human's turn begins we stamp a start time, and
  // each decision's elapsed time is collected per hand for the review and export.
  const turnStartRef = useRef<number | null>(null);
  const currentHandTimingsRef = useRef<DecisionTiming[]>([]);

  const startHand = useCallback((dealer: number) => {
    const currentStacks = stacksRef.current;
    const activeSeats = setup.seats.filter((s) => currentStacks[s.id] > 0);
    if (activeSeats.length < 2) {
      // The game is over (someone busted, or the human is the last one left).
      // This MUST set engine to null — Table.tsx's Champion/Game-over splash
      // is gated on `!engine`. Without this, the hook just silently bailed
      // here forever: nextHand() kept incrementing the hand number and
      // re-arming the 3.5s auto-advance timer every cycle, while the board
      // stayed frozen on the last (already-finished) hand — a permanent
      // freeze that looked like a stuck game, sometimes with a stale "You
      // Win" banner still attached to that last hand's result.
      setEngine(null);
      return;
    }
    const level = levelAt(schedule, levelIndexRef.current);
    const newEngine = new HandEngine({
      players: setup.seats.map((s) => ({ id: s.id, name: s.name, stack: currentStacks[s.id] })),
      dealerSeat: dealer,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante,
      holeCardBias: setup.cardLuck && setup.cardLuck !== 'normal' ? { playerId: 'human', band: setup.cardLuck } : undefined,
    });
    setEngine(newEngine);
    setHandSummary(null);
    setAdvice(null);
    currentHandTimingsRef.current = [];
    turnStartRef.current = null;
    setQueuedAction(null); // a fresh hand clears any leftover pre-press
  }, [setup, schedule]);

  useEffect(() => {
    startHand(dealerSeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const potTotal = engine ? engine.players.reduce((sum, p) => sum + p.totalContributed, 0) : 0;

  // Memoized so its identity is stable across the once-a-second clock re-render.
  // Otherwise the AI-turn effect (which depends on it) re-runs every tick and
  // clears/re-rolls the pending bot timer, stalling the table.
  const seatConfigById = useMemo(() => Object.fromEntries(setup.seats.map((s) => [s.id, s])), [setup.seats]);

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
    // Pass the real blind flags — these were hardcoded to false, so the coach
    // never knew the human was in the blinds and skipped its blind-specific
    // advice ("you'll act first after the flop...") entirely.
    const position = classifyPosition(
      seatIndexInOrder,
      engine.actingOrder.length,
      engine.smallBlindId === 'human',
      engine.bigBlindId === 'human',
    );
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
  const [actionDeadline, setActionDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (currentActorId === 'human' && !engine?.isHandOver()) {
      turnStartRef.current = performance.now();
      setActionDeadline(setup.actionTimerSeconds ? Date.now() + setup.actionTimerSeconds * 1000 : null);
    } else {
      setActionDeadline(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentActorId, engine]);
  const actionSecondsLeft = actionDeadline != null ? Math.max(0, Math.ceil((actionDeadline - nowTick) / 1000)) : null;

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
      // Where this bot sits in the action order (0 = first to act, 1 = last),
      // so the AI can play tighter early and steal/bluff more in late position.
      const live = engine.actingOrder.filter((si) => !engine.players[si].folded && !engine.players[si].sittingOut);
      const posIdx = live.findIndex((si) => engine.players[si].id === actorId);
      const positionFraction = live.length > 1 && posIdx >= 0 ? posIdx / (live.length - 1) : 0.5;
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
        positionFraction,
        bigBlind: currentLevel.bigBlind,
      });
      // The fallback act() call here was itself unguarded: if the engine's
      // state had already moved on by the time this timer fired (e.g. a race
      // with another update), that call could ALSO throw — and since nothing
      // after it was wrapped, the exception would escape the setTimeout
      // callback entirely, skipping forceRender(). No error dialog, no
      // crash — just a UI that stops updating while the JS engine itself is
      // fine, which looks exactly like a silent freeze. The try/finally below
      // guarantees a re-render happens regardless of what these calls do, so
      // the UI can never get stuck silently even if both actions fail.
      try {
        try {
          engine.act(actorId, decision.type, decision.amount);
        } catch {
          engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
        }
      } catch (err) {
        console.error('Bot action failed for', actorId, err);
      } finally {
        forceRender((n) => n + 1);
      }
    }, BOT_DELAY_MIN_MS + Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));

    return () => clearTimeout(timer);
    // currentActorId is the key trigger: it advances after every bot action
    // (including checks/folds that leave potTotal unchanged), re-scheduling the
    // next actor. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, currentActorId, potTotal, seatConfigById]);

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
    // Update the ref synchronously so a nextHand() in this same tick reads the
    // credited (post-win) stacks even before the setStacks re-render lands.
    stacksRef.current = { ...stacksRef.current, ...newStacks };
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
      levelIndex,
    });
  }, [setup, stacks, dealerSeat, handNumber, handHistory, coachEnabled, levelIndex]);

  const humanAct = useCallback((type: ActionType, amount?: number) => {
    // Re-check the live turn from the engine (not the render closure) so a stale
    // click or an auto-fold timer firing a tick late can't drive an out-of-turn
    // action — that throws inside the engine and used to white-screen the app.
    if (!engine || engine.isHandOver() || engine.getCurrentActorId() !== 'human') return;
    const player = engine.players.find((p) => p.id === 'human')!;
    const valid = engine.getValidActions('human');
    const thinkMs = turnStartRef.current != null ? Math.round(performance.now() - turnStartRef.current) : 0;
    const street = engine.street; // capture before act() mutates the engine

    try {
      engine.act('human', type, amount ?? (type === 'call' ? valid.callAmount + player.streetContributed : undefined));
    } catch (err) {
      console.error('Ignored invalid human action', type, err);
      return;
    }
    turnStartRef.current = null;

    currentHandTimingsRef.current.push({
      street,
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
    forceRender((n) => n + 1);
  }, [engine, advice]);

  // Pre-press: queue an action for when it becomes the human's turn. Clicking the
  // same queued action again toggles it off. Toggling here does not touch the
  // engine — the execution effect below does that once it's actually our turn.
  const queueAction = useCallback((type: ActionType) => {
    setQueuedAction((prev) => (prev === type ? null : type));
  }, []);

  // When it becomes the human's turn, fire any queued pre-press action — but only
  // if it's still legal for the current spot (e.g. a queued "call" is discarded
  // if there's now nothing to call, a queued "check" if we're facing a bet).
  useEffect(() => {
    if (!queuedAction || currentActorId !== 'human' || !engine || engine.isHandOver()) return;
    const valid = engine.getValidActions('human');
    if (valid.types.includes(queuedAction)) {
      humanAct(queuedAction);
    }
    // Legal or not, the pre-press is consumed once our turn arrives.
    setQueuedAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedAction, currentActorId, engine]);

  // Auto-act for the human once their action timer expires: check if free, otherwise fold.
  useEffect(() => {
    if (actionSecondsLeft !== 0 || currentActorId !== 'human' || !engine || engine.isHandOver()) return;
    const valid = engine.getValidActions('human');
    humanAct(valid.types.includes('check') ? 'check' : 'fold');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSecondsLeft, currentActorId, engine]);

  const nextHand = useCallback(() => {
    // Blinds escalate at the hand boundary once the level timer has expired.
    if (!isLastLevel && Date.now() - levelStartedAtRef.current >= levelMs) {
      const newIndex = levelIndexRef.current + 1;
      levelIndexRef.current = newIndex;
      levelStartedAtRef.current = Date.now();
      setLevelIndex(newIndex);
    }
    const nextDealer = (dealerSeat + 1) % setup.seats.length;
    setDealerSeat(nextDealer);
    setHandNumber((n) => n + 1);
    startHand(nextDealer);
  }, [dealerSeat, setup.seats.length, startHand, isLastLevel, levelMs]);

  return {
    engine,
    potTotal,
    currentActorId,
    advice,
    handSummary,
    handNumber,
    leakTracker: leakTracker.current,
    humanAct,
    queuedAction,
    queueAction,
    nextHand,
    stacks,
    handHistory,
    coachEnabled,
    setCoachEnabled,
    actionSecondsLeft,
    currentLevel,
    levelNumber: levelIndex + 1,
    nextLevel: isLastLevel ? null : levelAt(schedule, levelIndex + 1),
    msLeftInLevel,
    scheduleName: schedule.name,
  };
}
