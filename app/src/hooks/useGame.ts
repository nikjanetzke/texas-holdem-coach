import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HandEngine } from '../engine/game';
import type { ActionLogEntry, HandPlayer, ShowdownResult, Street } from '../engine/game';
import type { Card } from '../engine/deck';
import type { ActionType } from '../engine/betting';
import { decideAIAction } from '../ai/decide';
import type { AIProfile } from '../ai/profiles';
import { CHARACTERS } from '../ai/characters';
import { classifyPosition, generateAdvice, LeakTracker, scoreDecision, suggestionLabel } from '../coach/coach';
import type { CoachAdvice, Leak } from '../coach/coach';
import { coachPositionFor } from '../coach/position';
import { loadSession, saveSession } from '../persistence/storage';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID, levelAt } from '../engine/blinds';
import type { BlindLevel } from '../engine/blinds';
import type { LuckBand } from '../engine/preflop';
import { classifyMistake, saveMistake } from '../training/mistakes';
import type { MistakeKind } from '../training/mistakes';
import { sizingNote } from '../training/sizingDrill';
import { buildSessionReport, type SessionHand } from '../training/sessionReport';
import type { DecisionCoachNote } from '../training/replay';
import { recordSession } from '../persistence/progress';

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
  /** How quickly the computer opponents act. Defaults to the last choice made. */
  botSpeed?: BotSpeed;
}

export interface HandSummaryEntry {
  playerId: string;
  score: number;
  explanation: string;
  thinkMs: number;
  /** True if this decision was a clear-cut error saved to "Practise your mistakes". */
  savedToDrill?: boolean;
  /** Extra coaching for this decision, e.g. a bet-sizing tip. */
  note?: string;
}

// One human decision's think-time and the context it was made in, captured for
// the post-hand review, the export, and (later) consistency analysis.
export interface DecisionTiming {
  street: Street;
  action: ActionType;
  thinkMs: number;
  equityPercent: number | null;
  potOddsPercent: number | null;
  /** The coach's verdict on this decision, for the hand replayer. */
  coach?: DecisionCoachNote;
}

export interface HandRecord {
  handNumber: number;
  dealerSeat: number;
  players: { id: string; name: string; holeCards: Card[] }[];
  communityCards: Card[];
  actionLog: ActionLogEntry[];
  showdownResult: ShowdownResult | null;
  decisionTimings: DecisionTiming[];
  /** Everyone's chips before the hand (for the replayer). Missing on older saved hands. */
  startStacks?: Record<string, number>;
}

// Long enough for the replayer, stats and opponent notes to have real
// material (~3-5 KB a hand in local storage).
const MAX_HAND_HISTORY = 100;

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

// Bots act after a random delay in a range so the table doesn't feel robotic
// and a human player can't infer anything from a fixed AI response time. The
// range is the player's choice: at a 6-9 player table the default could mean
// 15+ seconds of waiting between your own decisions.
export type BotSpeed = 'relaxed' | 'normal' | 'fast';
export const BOT_DELAYS: Record<BotSpeed, [number, number]> = {
  relaxed: [1500, 4000],
  normal: [800, 3200],
  fast: [250, 900],
};
const BOT_SPEED_KEY = 'texas-holdem-coach:pref:bot-speed:v1';
export function saveBotSpeedPref(s: BotSpeed): void {
  saveSession(s, BOT_SPEED_KEY);
}
export function loadBotSpeedPref(): BotSpeed {
  const v = loadSession<BotSpeed>(BOT_SPEED_KEY);
  return v === 'relaxed' || v === 'fast' || v === 'normal' ? v : 'normal';
}

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

// One computer player's decision, applied to the engine. Shared by the normal
// timed bot turn and by fast-forwarding a hand the human has skipped.
function playBotTurn(engine: HandEngine, actorId: string, profile: AIProfile, bigBlind: number): void {
  const player = engine.players.find((p) => p.id === actorId)!;
  const valid = engine.getValidActions(actorId);
  const numOpponents = engine.players.filter((p) => !p.folded && !p.sittingOut && p.id !== actorId).length;
  // Where this bot sits in the action order (0 = first to act, 1 = last),
  // so the AI can play tighter early and steal/bluff more in late position.
  const live = engine.actingOrder.filter((si) => !engine.players[si].folded && !engine.players[si].sittingOut);
  const posIdx = live.findIndex((si) => engine.players[si].id === actorId);
  const positionFraction = live.length > 1 && posIdx >= 0 ? posIdx / (live.length - 1) : 0.5;
  const potTotal = engine.players.reduce((sum, p) => sum + p.totalContributed, 0);
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
    profile,
    positionFraction,
    bigBlind,
  });
  // Both the decision and the fallback are guarded: an exception escaping a
  // timer callback would skip the re-render and look like a silent freeze.
  try {
    try {
      engine.act(actorId, decision.type, decision.amount);
    } catch {
      engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
    }
  } catch (err) {
    console.error('Bot action failed for', actorId, err);
  }
}

// The coach's read of the human's CURRENT decision, computed straight from the
// live engine. Used both by the advice effect (for the coach panel) and,
// synchronously, at the moment the human acts — see humanAct.
function adviceForHumanSpot(engine: HandEngine): CoachAdvice {
  const player = engine.players.find((p) => p.id === 'human')!;
  const valid = engine.getValidActions('human');
  const numOpponents = engine.players.filter((p) => !p.folded && !p.sittingOut && p.id !== 'human').length;
  const seatIndexInOrder = engine.actingOrder.findIndex((seatIdx) => engine.players[seatIdx].id === 'human');
  // Same seat logic as the position badge, so the coach's words and the badge
  // agree. The order-of-play fallback is only for a seat the badge can't place.
  const position =
    coachPositionFor(engine) ??
    classifyPosition(seatIndexInOrder, engine.actingOrder.length, engine.smallBlindId === 'human', engine.bigBlindId === 'human');
  const potTotal = engine.players.reduce((sum, p) => sum + p.totalContributed, 0);
  return generateAdvice({
    holeCards: player.holeCards,
    communityCards: engine.communityCards,
    numOpponents: Math.max(1, numOpponents),
    potBeforeAction: potTotal - player.streetContributed,
    amountToCall: valid.callAmount,
    position,
    // Stack depth, for short-stack (all-in or fold) advice: the most either
    // side can lose this hand is the smaller of the two stacks.
    bigBlind: engine.bigBlind,
    effectiveStack: Math.min(
      player.stack + player.totalContributed,
      Math.max(0, ...engine.players.filter((p) => !p.folded && !p.sittingOut && p.id !== 'human').map((p) => p.stack + p.totalContributed)),
    ),
    stackBehind: player.stack,
  });
}

const sameCards = (a: Card[], b: Card[]) =>
  a.length === b.length && a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit);

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
  const [botSpeed, setBotSpeedState] = useState<BotSpeed>(() => setup.botSpeed ?? loadBotSpeedPref());
  const botSpeedRef = useRef(botSpeed);
  botSpeedRef.current = botSpeed;
  const setBotSpeed = useCallback((s: BotSpeed) => {
    setBotSpeedState(s);
    saveBotSpeedPref(s);
  }, []);
  // This sitting only — feeds the end-of-session report. A restored game's
  // earlier hands and decisions belong to a previous session and don't count.
  const sessionRef = useRef({
    startHandNumber: initialSaved?.handNumber ?? 1,
    startStack: (initialSaved?.stacks ?? {})['human'] ?? setup.seats.find((s) => s.id === 'human')?.stack ?? setup.startingStack,
    scores: [] as number[],
    mistakes: { freefold: 0, overfold: 0, overcall: 0 } as Record<MistakeKind, number>,
    smallValueBets: 0,
    // Every hand finished this sitting. Kept here rather than read back from the
    // hand history, which only holds the most recent MAX_HAND_HISTORY hands.
    hands: [] as SessionHand[],
    // Identifies this sitting in your progress history.
    id: Date.now(),
  });
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
  // Chips each player had when this hand was dealt (before blinds), for the replayer.
  const handStartStacksRef = useRef<Record<string, number>>({});

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
    handStartStacksRef.current = Object.fromEntries(newEngine.players.map((p) => [p.id, p.stack + p.totalContributed]));
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
  // Increments on EVERY action, including checks. Effects that wait for "the
  // next decision" must key on this, not just on who's acting and the pot:
  // when a player checks to close one street and is also first to act on the
  // next (e.g. the big blind heads-up, or whenever the small blind has
  // folded), neither the actor nor the pot changes. Keyed only on those, the
  // bot never got a turn scheduled and the table froze forever — the
  // long-standing "game hangs on a bot's turn" bug.
  const actionCount = engine?.actionLog.length ?? 0;

  const computeAdviceForHuman = useCallback(() => {
    if (!engine || !currentActorId || currentActorId !== 'human') {
      setAdvice(null);
      return;
    }
    setAdvice(adviceForHumanSpot(engine));
  }, [engine, currentActorId, potTotal, setup.seats, stacks, actionCount]);

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
  }, [currentActorId, engine, actionCount]);
  const actionSecondsLeft = actionDeadline != null ? Math.max(0, Math.ceil((actionDeadline - nowTick) / 1000)) : null;

  // Drive AI turns automatically.
  useEffect(() => {
    if (!engine || engine.isHandOver()) return;
    const actorId = engine.getCurrentActorId();
    if (!actorId || actorId === 'human') return;
    const seat = seatConfigById[actorId];
    if (!seat || !seat.profile) return;

    const timer = setTimeout(() => {
      // The hand may have moved on without us (e.g. fast-forwarded by a skip).
      if (engine.isHandOver() || engine.getCurrentActorId() !== actorId) {
        forceRender((n) => n + 1); // re-render so the right turn gets scheduled
        return;
      }
      try {
        playBotTurn(engine, actorId, seat.profile!, currentLevel.bigBlind);
      } finally {
        forceRender((n) => n + 1);
      }
    }, (() => {
      // Read via ref so changing speed mid-hand applies to the next bot without
      // re-scheduling (and re-rolling) the one already thinking.
      const [min, max] = BOT_DELAYS[botSpeedRef.current];
      return min + Math.random() * (max - min);
    })());

    return () => clearTimeout(timer);
    // actionCount is the key trigger: it advances after every action, so the
    // next turn is always scheduled — even when the same bot acts again with
    // an unchanged pot (see actionCount above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, currentActorId, potTotal, seatConfigById, actionCount]);

  // When a hand reaches showdown, settle stacks and record history exactly once.
  // This runs on every render (no dep array) because `engine` mutates in place and
  // `forceRender` ticks don't change any dependency the effect could key off of —
  // the settledEngineRef guard is what makes this idempotent.
  const settledEngineRef = useRef<HandEngine | null>(null);
  const settleHand = (eng: HandEngine) => {
    if (!eng.isHandOver() || settledEngineRef.current === eng) return;
    settledEngineRef.current = eng;

    const newStacks: Record<string, number> = {};
    for (const p of eng.players) newStacks[p.id] = p.stack;
    // Update the ref synchronously so a nextHand() in this same tick reads the
    // credited (post-win) stacks even before the setStacks re-render lands.
    stacksRef.current = { ...stacksRef.current, ...newStacks };
    setStacks((prev) => ({ ...prev, ...newStacks }));
    setHandSummary((prev) => prev ?? []);

    const record: HandRecord = {
      handNumber,
      dealerSeat,
      players: eng.players.map((p: HandPlayer) => ({ id: p.id, name: p.name, holeCards: p.holeCards })),
      communityCards: eng.communityCards,
      actionLog: eng.actionLog,
      showdownResult: eng.showdownResult,
      decisionTimings: [...currentHandTimingsRef.current],
      startStacks: Object.fromEntries(eng.players.map((p) => [p.id, handStartStacksRef.current[p.id] ?? p.stack])),
    };
    setHandHistory((prev) => [record, ...prev].slice(0, MAX_HAND_HISTORY));

    // This sitting's tally, and your progress history (updated every hand).
    const sess = sessionRef.current;
    sess.hands.push({
      vpip: eng.actionLog.some(
        (a) =>
          a.playerId === 'human' &&
          a.street === 'preflop' &&
          !a.forced &&
          (a.type === 'call' || a.type === 'raise' || a.type === 'bet' || a.type === 'all-in'),
      ),
      won: (eng.showdownResult?.payouts['human'] ?? 0) > 0,
    });
    const report = buildSessionReport({
      hands: sess.hands,
      decisionScores: sess.scores,
      netChips: (newStacks['human'] ?? sess.startStack) - sess.startStack,
      mistakes: sess.mistakes,
      smallValueBets: sess.smallValueBets,
    });
    recordSession({
      id: sess.id,
      updatedAt: Date.now(),
      hands: report.handsPlayed,
      decisions: sess.scores.length,
      avgScore: report.avgScore,
      netChips: report.netChips,
      vpipPercent: report.vpipPercent,
      mistakes: { ...sess.mistakes },
      smallValueBets: sess.smallValueBets,
    });
  };
  useEffect(() => {
    if (engine) settleHand(engine);
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
    // Snapshot the spot BEFORE act(): acting can deal the next street, which
    // would make a saved mistake show a board the decision was never made on.
    const holeCardsBefore = [...player.holeCards];
    const boardBefore = [...engine.communityCards];
    const potBeforeAct = engine.players.reduce((sum, p) => sum + p.totalContributed, 0);
    const stackBeforeAct = player.stack + player.streetContributed;
    // The coach's advice is computed in an effect that runs AFTER the screen
    // paints. A fast click — or a pre-pressed action, which fires the instant
    // the turn starts — could land before it, and was then scored against no
    // advice (or a previous spot's): never scored, never saved as a mistake.
    // Use the effect's advice only if it's for exactly this spot; otherwise
    // compute it now. It's seeded from the spot, so it matches what the coach
    // panel shows.
    const spotAdvice =
      advice &&
      sameCards(advice.math.holeCards, holeCardsBefore) &&
      advice.math.boardCards.length === boardBefore.length &&
      advice.math.amountToCall === valid.callAmount
        ? advice
        : adviceForHumanSpot(engine);

    try {
      engine.act('human', type, amount ?? (type === 'call' ? valid.callAmount + player.streetContributed : undefined));
    } catch (err) {
      console.error('Ignored invalid human action', type, err);
      return;
    }
    turnStartRef.current = null;

    {
      const advice = spotAdvice;
      const result = scoreDecision({
        actualAction: type,
        suggestedAction: advice.suggestedAction,
        equityPercent: advice.equityPercent,
        potOddsPercent: advice.potOddsPercent,
        position: advice.position,
      });
      currentHandTimingsRef.current.push({
        street,
        action: type,
        thinkMs,
        equityPercent: advice.equityPercent,
        potOddsPercent: advice.potOddsPercent,
        coach: {
          suggested: suggestionLabel(advice),
          score: result.score,
          explanation: result.explanation,
          reason: advice.why,
          equityPercent: advice.equityPercent,
          potOddsPercent: advice.potOddsPercent,
          toCall: valid.callAmount,
        },
      });
      leakTracker.current.record({
        actualAction: type,
        suggestedAction: advice.suggestedAction,
        equityPercent: advice.equityPercent,
        potOddsPercent: advice.potOddsPercent,
        position: advice.position,
      });
      // Save clear-cut errors for the "Practise your mistakes" drill. `advice`
      // here is spotAdvice, guaranteed to describe this exact decision. Never
      // when you did what the coach suggested (e.g. a short stack folding a
      // hand not good enough to go all-in with).
      let savedToDrill = false;
      {
        const kind = type === advice.suggestedAction ? null : classifyMistake({
          action: type,
          validTypes: valid.types,
          callAmount: valid.callAmount,
          equityPercent: advice.equityPercent,
          potOddsPercent: advice.potOddsPercent,
        });
        if (kind) {
          saveMistake({
            kind,
            holeCards: holeCardsBefore,
            board: boardBefore,
            street,
            pot: advice.math.potBeforeCall,
            toCall: valid.callAmount,
            numOpponents: advice.math.numOpponents,
            position: advice.position,
            equityPercent: advice.equityPercent,
            potOddsPercent: advice.potOddsPercent,
            actualAction: type,
            savedAt: Date.now(),
          });
          savedToDrill = true;
          sessionRef.current.mistakes[kind]++;
        }
      }
      sessionRef.current.scores.push(result.score);
      // Bet sizing: a strong hand bet small on a board full of draws. An
      // all-in isn't a sizing choice (a short stack may simply be all there is).
      const note =
        type === 'bet' && amount != null && amount < stackBeforeAct
          ? sizingNote({ board: boardBefore, betAmount: amount, potBefore: potBeforeAct, equityPercent: advice.equityPercent })
          : null;
      if (note) sessionRef.current.smallValueBets++;
      setHandSummary((prev) => [
        ...(prev ?? []),
        { playerId: 'human', score: result.score, explanation: result.explanation, thinkMs, savedToDrill, note: note ?? undefined },
      ]);
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
    // Skipping ahead after folding used to ABANDON the unfinished hand: the
    // next hand was built from the stacks as they were before it, so chips the
    // player had already put in (blinds, a call before folding) were quietly
    // refunded, the bots' pot was voided, and the hand never reached history
    // (overstating VPIP and undercounting hands). Instead, play out the
    // remaining computer decisions instantly and settle the hand properly.
    if (engine && !engine.isHandOver()) {
      for (let guard = 0; guard < 500 && !engine.isHandOver(); guard++) {
        const id = engine.getCurrentActorId();
        const profile = id ? seatConfigById[id]?.profile : undefined;
        if (!id || id === 'human' || !profile) break; // never decide for the player
        playBotTurn(engine, id, profile, currentLevel.bigBlind);
      }
      settleHand(engine);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerSeat, setup.seats.length, startHand, isLastLevel, levelMs, engine, seatConfigById, currentLevel.bigBlind, handNumber]);

  // End-of-session summary, built from this sitting's hands and decisions.
  const getSessionReport = useCallback((currentHumanStack: number) => {
    const sess = sessionRef.current;
    return buildSessionReport({
      hands: sess.hands,
      decisionScores: sess.scores,
      netChips: currentHumanStack - sess.startStack,
      mistakes: sess.mistakes,
      smallValueBets: sess.smallValueBets,
    });
  }, []);

  /** This sitting's id in your progress history. */
  const sessionId = sessionRef.current.id;

  return {
    botSpeed,
    setBotSpeed,
    getSessionReport,
    sessionId,
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
