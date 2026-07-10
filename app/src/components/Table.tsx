import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { useGame } from '../hooks/useGame';
import { HandHistoryPanel } from './HandHistoryPanel';
import { StatsPanel } from './StatsPanel';
import { ExportControls } from './ExportControls';
import { HAND_RANK_NAMES } from '../engine/evaluator';
import type { ActionType } from '../engine/betting';
import { PokerCanvas } from '../pixi/PokerCanvas';
import { soundManager, type SfxName } from '../sound/SoundManager';
import { setSpeechEnabled, speak, speechSupported } from '../sound/speech';
import { chenScore } from '../engine/preflop';
import type { CoachMath } from '../coach/coach';
import type { Card } from '../engine/deck';
import { SCENARIO_STRATEGIES } from '../scenarios/strategy';
import { StrategyGuide } from './StrategyGuide';
import { describeHumanPosition } from '../coach/position';

// Colour does the early teaching: red = play tight, green = you have the edge,
// blue = blinds (already paid in). The poker names come later, in the explainer.
const POSITION_TONES: Record<'red' | 'amber' | 'green' | 'blue', string> = {
  red: 'bg-rose-950/70 text-rose-300 ring-rose-600/50 hover:bg-rose-900/70',
  amber: 'bg-amber-950/70 text-amber-300 ring-amber-600/50 hover:bg-amber-900/70',
  green: 'bg-emerald-950/70 text-emerald-300 ring-emerald-600/50 hover:bg-emerald-900/70',
  blue: 'bg-sky-950/70 text-sky-300 ring-sky-600/50 hover:bg-sky-900/70',
};

const ACTION_SOUND: Record<ActionType, SfxName> = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  bet: 'bet',
  raise: 'bet',
  'all-in': 'allin',
};

export function Table({ setup, onExit }: { setup: GameSetup; onExit: () => void }) {
  const {
    engine,
    potTotal,
    currentActorId,
    advice,
    handSummary,
    handNumber,
    leakTracker,
    humanAct,
    queuedAction,
    queueAction,
    nextHand,
    handHistory,
    coachEnabled,
    setCoachEnabled,
    actionSecondsLeft,
    currentLevel,
    nextLevel,
    msLeftInLevel,
  } = useGame(setup);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [muted, setMuted] = useState(soundManager.muted);
  const lastLoggedActionCount = useRef(0);
  const lastHandOverSignaled = useRef(false);
  const [speechByPlayer, setSpeechByPlayer] = useState<Record<string, string>>({});
  // Coach suggestion is hidden behind a reveal so you can commit to your own
  // read first; resets each turn. `heldAdvice` keeps the last suggestion around
  // for the rest of the hand so toggling the coach on after you fold still shows it.
  const [coachRevealed, setCoachRevealed] = useState(false);
  const [heldAdvice, setHeldAdvice] = useState<typeof advice>(null);
  const [showCardRating, setShowCardRating] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [openPanel, setOpenPanel] = useState<'stats' | 'history' | 'export' | null>('stats');
  const [showMenu, setShowMenu] = useState(false);
  // Auto-advance defaults on (paused = false); the setup screen can flip these.
  const [paused, setPaused] = useState(!(setup.autoAdvanceDefault ?? true));
  const [speechOn, setSpeechOn] = useState(setup.speechDefault ?? false);

  // Honour a "speech on by default" choice from the setup screen.
  useEffect(() => {
    if (setup.speechDefault) setSpeechEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [winGifFailed, setWinGifFailed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const scenarioStrategy = setup.scenarioId ? SCENARIO_STRATEGIES[setup.scenarioId] : undefined;
  const prevSecLeftRef = useRef<number | null>(null);
  const spokenTurnRef = useRef<number>(-1);
  const feltObserverRef = useRef<ResizeObserver | null>(null);
  const feltResizeRef = useRef<() => void>(() => {});
  // Remembered so the end-of-game splash can tell champion (>0) from bust (0)
  // even after the engine has been torn down.
  const lastHumanStackRef = useRef<number>(setup.startingStack);
  const [canvasSize, setCanvasSize] = useState({ width: 880, height: 500 });

  // A callback ref (rather than useEffect on an empty-dep useRef) because the
  // felt div doesn't exist on the very first render — `engine` starts out
  // null until useGame's setup effect runs, so this node mounts late.
  const feltRef = useCallback((el: HTMLDivElement | null) => {
    feltObserverRef.current?.disconnect();
    feltObserverRef.current = null;
    window.removeEventListener('resize', feltResizeRef.current);
    if (!el) return;
    const ASPECT = 880 / 500;
    const update = () => {
      // Fit the table to the largest size that fits inside its own container box
      // (both width and height). The container is a flex cell whose size the CSS
      // layout controls — wide-and-short in landscape (table beside the controls),
      // full-width in portrait (controls below) — so measuring the box directly
      // makes the table fill whatever space the responsive layout gives it.
      const cw = Math.max(200, Math.floor(el.clientWidth));
      const ch = Math.max(160, Math.floor(el.clientHeight));
      let w = cw;
      let h = Math.round(w / ASPECT);
      if (h > ch) {
        h = ch;
        w = Math.round(h * ASPECT);
      }
      if (w > cw) {
        w = cw;
        h = Math.round(w / ASPECT);
      }
      setCanvasSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    feltResizeRef.current = update;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    feltObserverRef.current = observer;
    window.addEventListener('resize', update);
  }, []);

  const validActions =
    engine && !engine.isHandOver() && currentActorId === 'human' ? engine.getValidActions('human') : null;

  // Reset the bet sizing slider to a sensible default only when a genuinely new
  // decision point arrives — NOT on every render. `validActions` is a fresh object
  // each render, so keying the effect on it made the once-a-second clock tick
  // reset the slider mid-drag (the desktop "slider doesn't work" bug). Keying on a
  // stable signature (whose turn, street, price, hand) fixes that.
  const turnSignature =
    validActions && engine ? `${currentActorId}|${engine.street}|${engine.currentBet}|${handNumber}` : null;
  useEffect(() => {
    if (!turnSignature || !validActions) return;
    const opening = validActions.types.includes('raise') ? validActions.minRaiseTo : currentLevel.bigBlind;
    setRaiseAmount(Math.min(validActions.maxRaiseTo, opening));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnSignature]);

  // Play a sound effect for every new action logged (human or bot) and on showdown.
  useEffect(() => {
    if (!engine) return;
    const log = engine.actionLog;
    for (let i = lastLoggedActionCount.current; i < log.length; i++) {
      const entry = log[i];
      soundManager.play(ACTION_SOUND[entry.type]);
      const profile = setup.seats.find((s) => s.id === entry.playerId)?.profile;
      const lines = profile?.catchphrases[entry.type as keyof typeof profile.catchphrases];
      if (lines && lines.length > 0) {
        const line = lines[Math.floor(Math.random() * lines.length)];
        setSpeechByPlayer((prev) => ({ ...prev, [entry.playerId]: line }));
        setTimeout(() => {
          setSpeechByPlayer((prev) => {
            if (prev[entry.playerId] !== line) return prev;
            const { [entry.playerId]: _omit, ...rest } = prev;
            return rest;
          });
        }, 2600);
      }
    }
    lastLoggedActionCount.current = log.length;

    if (engine.isHandOver() && !lastHandOverSignaled.current) {
      lastHandOverSignaled.current = true;
      soundManager.play('win');
      // Reveal celebration: winner(s) say a line, and the dealer calls the hand
      // aloud (when speech is on). Cards + hand-rank pills are already shown.
      const sd = engine.showdownResult;
      if (sd) {
        const winners = Object.keys(sd.payouts);
        const winLines = ['I win!', 'Ship it!', "Read 'em and weep!", "That's mine.", 'Gotcha!'];
        if (winners.length > 0) {
          const updates: Record<string, string> = {};
          winners.forEach((id, i) => {
            updates[id] = id === 'human' ? 'I win!' : winLines[(i + 1) % winLines.length];
          });
          setSpeechByPlayer((prev) => ({ ...prev, ...updates }));
          setTimeout(() => {
            setSpeechByPlayer((prev) => {
              const rest = { ...prev };
              winners.forEach((id) => {
                if (rest[id] && winLines.includes(rest[id])) delete rest[id];
              });
              return rest;
            });
          }, 3000);

          // Dealer call-out of the winning hand (TTS, no-op if speech is off).
          const id = winners[0];
          const name = engine.players.find((p) => p.id === id)?.name ?? 'Player';
          const rank = sd.bestHandByPlayer?.[id]?.rank;
          const handName = rank != null ? HAND_RANK_NAMES[rank] : '';
          speak(`${name} wins${handName ? ` with ${handName.toLowerCase()}` : ''}.`);
        }
      }
    } else if (!engine.isHandOver()) {
      lastHandOverSignaled.current = false;
    }
  });

  // Hold onto the latest advice so it survives past your own turn within a hand.
  useEffect(() => {
    if (advice) setHeldAdvice(advice);
  }, [advice]);

  // New hand: clear the held suggestion and re-arm the reveal gate.
  useEffect(() => {
    setHeldAdvice(null);
    setCoachRevealed(false);
  }, [handNumber]);

  // Re-arm the reveal each time it becomes the human's turn again.
  useEffect(() => {
    if (currentActorId === 'human') setCoachRevealed(false);
  }, [currentActorId]);

  // Countdown beeps: a tick at 10s left, then every second from 5 down to 1.
  useEffect(() => {
    const s = actionSecondsLeft;
    const prev = prevSecLeftRef.current;
    prevSecLeftRef.current = s;
    if (s == null || prev == null || s >= prev) return;
    if (s === 10 || (s >= 1 && s <= 5)) soundManager.play('click');
  }, [actionSecondsLeft]);

  // Read the coach's read aloud (Web Speech API) on your turn — once per turn,
  // whenever speech is on and the advice has been computed. Independent of the
  // coach panel / reveal gate so you always hear something.
  useEffect(() => {
    // Voice coaching is gated on the coach toggle: with the coach off, speech
    // still announces your turn but no longer reads out the suggestion/reasoning.
    if (!speechOn || engine?.isHandOver()) return;
    if (currentActorId !== 'human' || !advice) return;
    if (spokenTurnRef.current === handNumber) return;
    spokenTurnRef.current = handNumber;
    speak(
      coachEnabled
        ? `It's your turn. Coach suggests ${advice.suggestedAction}. ${advice.reasoning[0] ?? ''}`
        : `It's your turn.`,
    );
  }, [speechOn, currentActorId, engine, advice, handNumber, coachEnabled]);

  // Allow a fresh spoken suggestion each time it returns to your turn.
  useEffect(() => {
    if (currentActorId !== 'human') spokenTurnRef.current = -1;
  }, [currentActorId]);

  // Auto-advance to the next hand after a hand ends, unless paused. Long enough
  // to actually read what happened (cards, opponents' final bets, the result
  // panel) — 3.5s was too tight to read a multi-way hand's action before the
  // board was whisked away for the next deal.
  // nextHand's identity changes every render, so we call it via a ref and key the
  // effect on a stable boolean + handNumber — otherwise the 1s clock tick would
  // re-run this effect and reset the timer before it could ever fire.
  const AUTO_ADVANCE_MS = 6500;
  const nextHandRef = useRef(nextHand);
  nextHandRef.current = nextHand;
  const handOver = !!engine && engine.isHandOver();
  useEffect(() => {
    if (!handOver || paused) return;
    const t = setTimeout(() => nextHandRef.current(), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [handOver, paused, handNumber]);

  // The win celebration (coin burst + gif + banner) is deliberately delayed and
  // then auto-dismissed, rather than appearing instantly and staying up the
  // whole auto-advance window. Previously it covered the community/hole cards
  // the very instant the hand ended — before you'd even seen what beat what —
  // and stayed there blocking the view. Now: a beat to see the cards and hear
  // the dealer call the hand, THEN the celebration, THEN a clear view of the
  // board and result panel again before the next hand deals.
  const [showWinBanner, setShowWinBanner] = useState(false);
  useEffect(() => {
    if (!handOver) {
      setShowWinBanner(false);
      return;
    }
    const showAt = setTimeout(() => setShowWinBanner(true), 1100);
    const hideAt = setTimeout(() => setShowWinBanner(false), 1100 + 2400);
    return () => {
      clearTimeout(showAt);
      clearTimeout(hideAt);
    };
  }, [handOver, handNumber]);

  function toggleMuted() {
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
    if (!next) soundManager.play('click');
  }

  // Show a typed message as a speech bubble over your seat. (AI replies come later.)
  function sendChat(text: string) {
    const msg = text.trim().slice(0, 60);
    if (!msg) return;
    setSpeechByPlayer((prev) => ({ ...prev, human: msg }));
    setChatText('');
    setTimeout(() => {
      setSpeechByPlayer((prev) => {
        if (prev['human'] !== msg) return prev;
        const { human: _omit, ...rest } = prev;
        return rest;
      });
    }, 4000);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  if (!engine) {
    // The game can't continue: either you busted (game over) or you're the last
    // player with chips (champion). We remembered your last stack below.
    const won = lastHumanStackRef.current > 0;
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 text-center">
        <div
          className={`pointer-events-none absolute inset-0 ${
            won
              ? 'bg-[radial-gradient(ellipse_at_center,_rgba(234,179,8,0.28),_transparent_65%)]'
              : 'bg-[radial-gradient(ellipse_at_center,_rgba(190,18,60,0.18),_transparent_65%)]'
          }`}
        />
        {won && <CoinBurst />}
        <div className="animate-pop relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-8 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/5">
          <div className={`pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent ${won ? 'via-amber-400/70' : 'via-rose-500/60'} to-transparent`} />
          {won ? (
            <>
              {!winGifFailed && (
                <img
                  src="/assets/poker-animation.gif"
                  alt=""
                  onError={() => setWinGifFailed(true)}
                  className="mx-auto mb-4 w-40 rounded-xl shadow-lg shadow-black/50"
                />
              )}
              <div className="text-5xl">🏆</div>
              <h1 className="mt-2 bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-4xl font-black text-transparent">
                Champion!
              </h1>
              <p className="mt-2 text-slate-300">You're the last player standing — everyone else is out of chips.</p>
            </>
          ) : (
            <>
              <div className="text-5xl">💀</div>
              <h1 className="mt-2 bg-gradient-to-b from-rose-300 to-rose-500 bg-clip-text text-4xl font-black text-transparent">
                Game over
              </h1>
              <p className="mt-2 text-slate-300">You're out of chips. Better luck next time.</p>
            </>
          )}
          <button
            onClick={onExit}
            className="mt-6 w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-3 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/40 transition-all hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.99]"
          >
            ♠ Play again
          </button>
        </div>
      </div>
    );
  }

  const isHandOver = engine.isHandOver();
  const human = engine.players.find((p) => p.id === 'human')!;
  // Part of the coaching UI: computed here but only ever rendered when
  // coachEnabled is on (badge, explainer modal and all).
  const positionInfo = coachEnabled ? describeHumanPosition(engine) : null;
  lastHumanStackRef.current = human.stack;
  const leaks = leakTracker.topLeaks();
  const payouts = engine.showdownResult?.payouts ?? {};
  const bestHands = engine.showdownResult?.bestHandByPlayer ?? {};

  const sbPlayerId = engine.smallBlindId;
  const bbPlayerId = engine.bigBlindId;

  return (
    <div
      className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col overflow-x-hidden px-3 py-2 sm:px-4"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Top bar — premium glass strip. Wraps onto a second line instead of
          overflowing when the row's buttons (with their on/off text labels)
          don't fit one line — that's structurally immune to producing a
          horizontal scrollbar at any viewport width, unlike a fixed-width row. */}
      <div className="relative mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 rounded-xl border border-amber-500/15 bg-gradient-to-b from-slate-900/90 to-slate-950/80 px-2.5 py-1.5 text-sm text-slate-300 shadow-lg ring-1 ring-white/5">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            onClick={onExit}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 ring-1 ring-slate-600 hover:bg-slate-700 hover:text-slate-100 sm:text-sm"
            title="Leave this game and return to the menu"
          >
            ← Exit
          </button>
          <span className="shrink-0 font-bold text-amber-200">#{handNumber}</span>
          {setup.scenarioName &&
            (scenarioStrategy ? (
              <button
                onClick={() => setStrategyOpen(true)}
                className="shrink-0 rounded-full bg-purple-900/60 px-2 py-0.5 text-xs text-purple-200 ring-1 ring-purple-500/40 transition-colors hover:bg-purple-800/70"
                title="Re-read how to play this scenario"
              >
                📖 {setup.scenarioName}
              </button>
            ) : (
              <span className="shrink-0 rounded-full bg-purple-900/60 px-2 py-0.5 text-xs text-purple-200">{setup.scenarioName}</span>
            ))}
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs capitalize text-emerald-300">{engine.street}</span>
          <span
            className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-amber-200"
            title={nextLevel ? `Next: ${nextLevel.smallBlind}/${nextLevel.bigBlind}` : 'Top level reached'}
          >
            {currentLevel.smallBlind}/{currentLevel.bigBlind}
            {currentLevel.ante > 0 && ` (a${currentLevel.ante})`}
            {Number.isFinite(msLeftInLevel) && ` · ${formatClock(msLeftInLevel)}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-950/70 px-3 py-1 font-mono text-base font-extrabold text-emerald-300 ring-1 ring-emerald-600/40 sm:text-lg">
            💰 ${human.stack.toLocaleString()}
            {human.stack > setup.startingStack && (
              <span className="text-sm text-emerald-400">(+${(human.stack - setup.startingStack).toLocaleString()})</span>
            )}
          </span>
          <button
            onClick={() => setCoachEnabled((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:text-sm ${
              coachEnabled ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="Show/hide coaching. Leaks are still tracked in the background when off."
          >
            🎓 Coach <span className={coachEnabled ? 'text-emerald-300' : 'text-slate-500'}>{coachEnabled ? 'On' : 'Off'}</span>
          </button>
          <button
            onClick={toggleMuted}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:text-sm ${
              muted ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-emerald-700 text-white hover:bg-emerald-600'
            }`}
            title="Toggle sound effects"
          >
            {muted ? '🔇 Sound Off' : '🔊 Sound On'}
          </button>
          {speechSupported() && (
            <button
              onClick={() => {
                const next = !speechOn;
                setSpeechOn(next);
                setSpeechEnabled(next);
                if (next) speak('Speech on.');
              }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:text-sm ${
                speechOn ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Read your turn (and the coach's advice, when the coach is on) aloud"
            >
              {speechOn ? '🗣 Voice On' : '🔕 Voice Off'}
            </button>
          )}
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
              chatOpen ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Say something to the table"
          >
            💬
          </button>
          <button
            onClick={() => setPaused((v) => !v)}
            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
              paused ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title={paused ? 'Auto-advance paused — tap to resume' : 'Pause auto-advance between hands'}
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-100 ring-1 ring-slate-500 hover:bg-slate-600"
            title="Toggle fullscreen"
          >
            <span className="text-sm">⛶</span> Full
          </button>
          <button
            onClick={() => setShowMenu(true)}
            className="rounded-full bg-slate-800 px-2 py-0.5 text-base font-semibold leading-none text-slate-300 hover:bg-slate-700"
            title="Hand history & export"
          >
            ⋯
          </button>
        </div>
      </div>

      {/* Chat: type a line that pops as a bubble over your seat. */}
      {chatOpen && (
        <div className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendChat(chatText);
            }}
            className="flex w-full max-w-md items-center gap-2 rounded-xl border border-indigo-400/30 bg-slate-900/95 p-2 shadow-2xl ring-1 ring-white/5"
          >
            <input
              autoFocus
              value={chatText}
              maxLength={60}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something to the table…"
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/40"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Send
            </button>
            <button type="button" onClick={() => setChatOpen(false)} className="rounded-lg px-2 py-2 text-slate-400 hover:text-slate-100">
              ✕
            </button>
          </form>
        </div>
      )}

      {/* Win celebration — win gif (if present) + coin burst + banner. Delayed
          and auto-dismissed (see showWinBanner above) so it comes AFTER you've
          had a moment to see the cards and hear the hand called, and clears
          again afterward instead of sitting over the board indefinitely. */}
      {showWinBanner && payouts['human'] > 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-start px-4 pt-[12vh]">
          <CoinBurst />
          {!winGifFailed && (
            <img
              src="/assets/poker-animation.gif"
              alt=""
              onError={() => setWinGifFailed(true)}
              className="animate-pop relative mb-4 w-48 max-w-[55vw] rounded-2xl shadow-2xl shadow-black/50"
            />
          )}
          <div className="animate-pop relative rounded-2xl border-2 border-amber-400 bg-amber-500/95 px-8 py-4 text-center shadow-2xl shadow-amber-900/50">
            <div className="text-3xl font-extrabold text-slate-900">🎉 You win ${payouts['human'].toLocaleString()}!</div>
            {bestHands['human'] && (
              <div className="mt-0.5 text-sm font-semibold text-slate-800">with {HAND_RANK_NAMES[bestHands['human'].rank]}</div>
            )}
          </div>
        </div>
      )}

      {/* Side-by-side (table + controls column) only on SHORT landscape screens
          (i.e. phones held sideways). Desktop and portrait stay stacked, which
          looks better and keeps the action buttons always visible. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 [@media(max-height:640px)_and_(orientation:landscape)]:flex-row [@media(max-height:640px)_and_(orientation:landscape)]:items-stretch">
        {/* Felt — hugs the canvas when stacked, fills the cell when side-by-side. */}
        <div ref={feltRef} className="mx-auto flex w-full max-w-4xl items-center justify-center overflow-hidden [@media(max-height:640px)_and_(orientation:landscape)]:min-h-0 [@media(max-height:640px)_and_(orientation:landscape)]:max-w-none [@media(max-height:640px)_and_(orientation:landscape)]:flex-1">
        <PokerCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          potTotal={potTotal}
          handNumber={handNumber}
          winnerIds={isHandOver ? Object.keys(payouts) : []}
          communityCards={engine.communityCards}
          seats={engine.players.map((p, idx) => {
            const showCards = p.id === 'human' || (isHandOver && !p.folded && !!engine.showdownResult);
            const handLabel = isHandOver && bestHands[p.id] ? HAND_RANK_NAMES[bestHands[p.id].rank] : undefined;
            return {
              player: p,
              isDealer: idx === engine.dealerSeat,
              isSmallBlind: p.id === sbPlayerId,
              isBigBlind: p.id === bbPlayerId,
              isActing: p.id === currentActorId && !isHandOver,
              isWinner: !!payouts[p.id],
              showCards,
              handLabel,
              speech: speechByPlayer[p.id],
              portrait: (() => {
                const cfg = setup.seats.find((s) => s.id === p.id);
                return cfg?.profile?.portrait ?? cfg?.portrait;
              })(),
            };
          })}
        />
        </div>

        {/* Controls/info: a scrollable side column on short landscape screens,
            full-width below the table otherwise. */}
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 [@media(max-height:640px)_and_(orientation:landscape)]:mx-0 [@media(max-height:640px)_and_(orientation:landscape)]:w-[340px] [@media(max-height:640px)_and_(orientation:landscape)]:max-w-none [@media(max-height:640px)_and_(orientation:landscape)]:shrink-0 [@media(max-height:640px)_and_(orientation:landscape)]:overflow-y-auto">

      {/* Starting-hand rating (click to expand) */}
      {coachEnabled && engine.street === 'preflop' && human.holeCards.length === 2 && !isHandOver && (
        <StartingHandRating cards={human.holeCards} open={showCardRating} onToggle={() => setShowCardRating((v) => !v)} />
      )}

      {/* Coach panel */}
      {coachEnabled && (() => {
        const liveTurn = currentActorId === 'human' && !isHandOver;
        // While it's your turn, keep the suggestion hidden until you reveal it so
        // you can commit to your own decision first. After you've acted (or folded),
        // fall back to the held suggestion so it's still visible.
        if (liveTurn && advice && !coachRevealed) {
          return (
            <div className="animate-fade-up relative mt-4 flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-indigo-400/25 bg-gradient-to-b from-indigo-950/70 to-slate-950/80 p-3 text-sm text-slate-300 shadow-lg ring-1 ring-white/5">
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
              <span>Decide your play first — then check the coach's take.</span>
              <button
                onClick={() => setCoachRevealed(true)}
                className="shrink-0 rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow ring-1 ring-indigo-400/40 hover:from-indigo-400 hover:to-indigo-600"
              >
                Reveal suggestion
              </button>
            </div>
          );
        }
        const shown = liveTurn ? advice : heldAdvice;
        if (!shown) return null;
        return (
          <div className="animate-fade-up relative mt-4 overflow-hidden rounded-xl border border-indigo-400/25 bg-gradient-to-b from-indigo-950/70 to-slate-950/80 p-3 text-sm text-slate-200 shadow-lg ring-1 ring-white/5">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-gradient-to-b from-indigo-500 to-indigo-700 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow ring-1 ring-indigo-400/40">Coach</span>
              <span className="font-semibold">
                Suggests: <span className="text-amber-300 capitalize">{shown.suggestedAction}</span>
              </span>
              <Stat label="Hand" value={shown.handStrengthLabel} />
              <Stat label="Equity" value={`${shown.equityPercent.toFixed(0)}%`} />
              <Stat label="Pot odds" value={`${shown.potOddsPercent.toFixed(0)}%`} />
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-slate-300">
              {shown.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {shown.warnings.map((w, i) => (
              <div key={i} className="mt-1 text-amber-400">
                ⚠ {w}
              </div>
            ))}
            <button
              onClick={() => setShowMath((v) => !v)}
              className="mt-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
            >
              {showMath ? '▾ Hide the math' : '▸ Show the math'}
            </button>
            {showMath && <MathBreakdown math={shown.math} suggested={shown.suggestedAction} />}
          </div>
        );
      })()}

      {/* Action bar — order-first keeps it directly under the table so the coach
          panel can never push the buttons below the fold. */}
      {!isHandOver && !human.folded && (
        <div
          className={`animate-fade-up order-first mt-2 rounded-xl border bg-slate-900/90 p-3 ${
            validActions ? 'border-emerald-600/50 ring-1 ring-emerald-500/30' : 'border-slate-700'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className={`text-sm font-bold ${validActions ? 'text-emerald-300' : 'text-slate-400'}`}>
              {validActions
                ? '● Your turn'
                : queuedAction
                  ? `○ Pre-press queued: ${queuedAction} — will play on your turn`
                  : '○ Waiting — tap to pre-press'}
            </span>
            <span className="flex items-center gap-2">
              {positionInfo && (
                <button
                  onClick={() => setPositionOpen(true)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 transition-colors ${POSITION_TONES[positionInfo.tone]}`}
                  title={positionInfo.tip}
                >
                  📍 {positionInfo.plain}
                </button>
              )}
              {validActions && actionSecondsLeft != null && (
                <span className={`font-mono text-sm font-bold ${actionSecondsLeft <= 5 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {actionSecondsLeft}s
                </span>
              )}
            </span>
          </div>
          {!validActions ? (
            // Not your turn yet: Fold/Check/Call can be *pre-pressed* — the action
            // is queued and auto-plays when your turn arrives (discarded if it's no
            // longer legal, e.g. a queued Check when you're then facing a bet).
            // Bet/Raise/All-in need a live amount, so they stay disabled here.
            <div className="flex flex-wrap gap-1.5">
              <ActionButton
                label="Fold"
                tone="danger"
                active={queuedAction === 'fold'}
                onClick={() => queueAction('fold')}
              />
              <ActionButton
                label="Check"
                tone="neutral"
                active={queuedAction === 'check'}
                onClick={() => queueAction('check')}
              />
              <ActionButton
                label="Call"
                tone="primary"
                active={queuedAction === 'call'}
                onClick={() => queueAction('call')}
              />
              <ActionButton label="Raise" tone="primary" disabled onClick={() => {}} />
              <ActionButton label="All in" tone="danger" disabled onClick={() => {}} />
            </div>
          ) : (
          <>
          {actionSecondsLeft != null && (
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                  actionSecondsLeft <= 5 ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${(actionSecondsLeft / (setup.actionTimerSeconds ?? 1)) * 100}%` }}
              />
            </div>
          )}
          {/* Compact bet sizing: quick-fraction chips + thin slider + amount, on one line. */}
          {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
            <div className="mb-2 flex items-center gap-2">
              <div className="flex gap-1">
                <QuickBet label="½ pot" onClick={() => setRaiseAmount(clamp(Math.round(potTotal * 0.5), validActions, currentLevel.bigBlind))} />
                <QuickBet label="¾ pot" onClick={() => setRaiseAmount(clamp(Math.round(potTotal * 0.75), validActions, currentLevel.bigBlind))} />
                <QuickBet label="Pot" onClick={() => setRaiseAmount(clamp(potTotal, validActions, currentLevel.bigBlind))} />
              </div>
              <input
                type="range"
                min={validActions.types.includes('raise') ? validActions.minRaiseTo : currentLevel.bigBlind}
                max={validActions.maxRaiseTo}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="h-1.5 flex-1 accent-emerald-500"
              />
              <span className="w-20 shrink-0 text-right font-mono text-sm font-bold text-amber-200">${raiseAmount.toLocaleString()}</span>
            </div>
          )}
          {/* Action buttons in one tight row. */}
          <div className="flex flex-wrap gap-1.5">
            {validActions.types.includes('fold') && (
              <ActionButton label="Fold" tone="danger" onClick={() => humanAct('fold')} />
            )}
            {validActions.types.includes('check') && (
              <ActionButton label="Check" tone="neutral" onClick={() => humanAct('check')} />
            )}
            {validActions.types.includes('call') && (
              <ActionButton label={`Call $${validActions.callAmount.toLocaleString()}`} tone="primary" onClick={() => humanAct('call')} />
            )}
            {validActions.types.includes('bet') && (
              <ActionButton label={`Bet $${raiseAmount.toLocaleString()}`} tone="primary" onClick={() => humanAct('bet', raiseAmount)} />
            )}
            {validActions.types.includes('raise') && (
              <ActionButton label={`Raise $${raiseAmount.toLocaleString()}`} tone="primary" onClick={() => humanAct('raise', raiseAmount)} />
            )}
            {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
              <ActionButton
                label={`All in`}
                tone="danger"
                onClick={() => humanAct(validActions.types.includes('raise') ? 'raise' : 'bet', validActions.maxRaiseTo)}
              />
            )}
          </div>
          </>
          )}
        </div>
      )}

      {/* Skip ahead once you've folded — no need to watch the bots finish. */}
      {!isHandOver && !validActions && human.folded && (
        <div className="animate-fade-up mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-300">
          <span>You folded — waiting on the other players.</span>
          <button
            onClick={nextHand}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
          >
            Skip to next hand →
          </button>
        </div>
      )}

      {/* Hand result */}
      {isHandOver && engine.showdownResult && (
        <div className="animate-fade-up mt-4 rounded-xl border border-emerald-600/50 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="mb-1 font-semibold text-emerald-300">Hand result</div>
          {Object.entries(payouts).map(([id, amount]) => (
            <div key={id}>
              <span className="font-semibold">{engine.players.find((p) => p.id === id)?.name}</span> won ${amount.toLocaleString()}
            </div>
          ))}
          {coachEnabled && handSummary && handSummary.length > 0 && (
            <div className="mt-2 space-y-0.5 text-slate-300">
              {handSummary.map((s, i) => (
                <div key={i}>
                  <span className={s.score >= 7 ? 'text-emerald-400' : s.score >= 5 ? 'text-amber-400' : 'text-rose-400'}>
                    Decision score {s.score}/10
                  </span>{' '}
                  <span className="text-slate-500">({(s.thinkMs / 1000).toFixed(1)}s)</span> — {s.explanation}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={nextHand}
            className="mt-3 rounded-lg bg-emerald-600 px-5 py-2 font-semibold transition-colors hover:bg-emerald-500"
          >
            Next hand →
          </button>
        </div>
      )}

      {/* Leaks */}
      {coachEnabled && leaks.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
          <div className="mb-1 font-semibold text-slate-300">Leaks to watch</div>
          {leaks.map((l) => (
            <div key={l.leak}>
              <span className="capitalize text-rose-300">{l.leak.replace(/([A-Z])/g, ' $1')}</span>: {l.count} time
              {l.count === 1 ? '' : 's'} ({l.percentOfHands.toFixed(0)}% of decisions)
            </div>
          ))}
        </div>
      )}

        </div>
      </div>

      {/* Re-openable scenario strategy guide (📖 in the top bar). */}
      {strategyOpen && scenarioStrategy && (
        <StrategyGuide strategy={scenarioStrategy} onClose={() => setStrategyOpen(false)} closeLabel="Back to the table" />
      )}

      {/* Position explainer — coaching UI, so it can only open while the coach
          is on (the badge that opens it is itself gated on coachEnabled). */}
      {coachEnabled && positionOpen && positionInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPositionOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-100">📍 Your seat this hand</h2>
              <button onClick={() => setPositionOpen(false)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                ✕
              </button>
            </div>
            <div className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ring-1 ${POSITION_TONES[positionInfo.tone]}`}>
              {positionInfo.plain}
            </div>
            <div className="space-y-2.5 text-sm leading-relaxed text-slate-300">
              {positionInfo.explainer.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
              Poker name for this seat: <span className="text-slate-300">{positionInfo.pokerName}</span>
            </p>
            <button
              onClick={() => setPositionOpen(false)}
              className="mt-4 w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-2.5 font-bold text-white shadow-lg ring-1 ring-emerald-400/40 hover:from-emerald-400 hover:to-emerald-600"
            >
              Back to the table
            </button>
          </div>
        </div>
      )}

      {/* Hand history & export live in a modal (opened from the ⋯ button) so they
          don't take up game screen space — they're only needed for review/export. */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowMenu(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">Stats, history &amp; export</h2>
              <button onClick={() => setShowMenu(false)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <Collapsible
                label="Your stats"
                open={openPanel === 'stats'}
                onToggle={() => setOpenPanel((p) => (p === 'stats' ? null : 'stats'))}
              >
                <StatsPanel history={handHistory} leaks={leaks} />
              </Collapsible>
              <Collapsible
                label={`Hand history${handHistory.length ? ` (${handHistory.length})` : ''}`}
                open={openPanel === 'history'}
                onToggle={() => setOpenPanel((p) => (p === 'history' ? null : 'history'))}
              >
                <HandHistoryPanel history={handHistory} />
              </Collapsible>
              <Collapsible
                label="Export & share"
                open={openPanel === 'export'}
                onToggle={() => setOpenPanel((p) => (p === 'export' ? null : 'export'))}
              >
                <ExportControls
                  setup={setup}
                  handHistory={handHistory}
                  leakTracker={leakTracker}
                  blinds={{ smallBlind: currentLevel.smallBlind, bigBlind: currentLevel.bigBlind }}
                />
              </Collapsible>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoinBurst() {
  const icons = ['🪙', '💰', '💵', '💸', '🤑', '✨', '🎉', '⭐'];
  const coins = Array.from({ length: 48 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {coins.map((_, i) => {
        const style: CSSProperties = {
          left: `${Math.random() * 100}%`,
          top: `${35 + Math.random() * 20}%`,
          animationDelay: `${Math.random() * 0.5}s`,
          ['--coin-rise' as string]: `${-(160 + Math.random() * 280)}px`,
          ['--coin-drift' as string]: `${(Math.random() - 0.5) * 180}px`,
          ['--coin-spin' as string]: `${(Math.random() - 0.5) * 720}deg`,
        };
        return (
          <span key={i} className="animate-coin absolute text-3xl" style={style}>
            {icons[i % icons.length]}
          </span>
        );
      })}
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-slate-200"
      >
        <span>{label}</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t border-slate-800 p-3">{children}</div>}
    </div>
  );
}

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(value: number, valid: { minRaiseTo: number; maxRaiseTo: number; types: ActionType[] }, bb: number) {
  const min = valid.types.includes('raise') ? valid.minRaiseTo : bb;
  return Math.max(min, Math.min(valid.maxRaiseTo, value));
}

function MathBreakdown({ math, suggested }: { math: CoachMath; suggested: ActionType }) {
  const equity = math.equityPercent;
  const beatsOdds = equity >= math.potOddsPercent;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-950/50 p-2.5 text-xs text-slate-300">
      <p className="text-slate-400">
        Simple version: compare <span className="text-emerald-300">how often you win</span> (equity) with{' '}
        <span className="text-amber-300">the price you're paying</span> (pot odds). If you win more often than the price,
        calling makes money over time.
      </p>
      <div>
        <div className="font-semibold text-slate-200">1. Equity — your chance to win</div>
        <p className="mt-0.5 text-slate-400">
          We deal out the rest of the board {math.iterations.toLocaleString()} times at random against{' '}
          {math.numOpponents} opponent{math.numOpponents === 1 ? '' : 's'} and count how often you'd win:
        </p>
        <p className="mt-0.5 font-mono">
          win {math.winPercent.toFixed(1)}% + (tie {math.tiePercent.toFixed(1)}% ÷ 2) ={' '}
          <span className="text-emerald-300">{equity.toFixed(1)}% equity</span>
        </p>
      </div>

      {math.facingBet ? (
        <>
          <div>
            <div className="font-semibold text-slate-200">2. Pot odds — the price to call</div>
            <p className="mt-1 text-slate-400">
              You're risking <span className="text-amber-300">{math.amountToCall}</span> to win the{' '}
              <span className="text-slate-200">{math.potBeforeCall}</span> already in the pot. After you call, the pot
              becomes {math.potBeforeCall} + {math.amountToCall} = {math.potBeforeCall + math.amountToCall}, and your{' '}
              {math.amountToCall} is part of it. The share you're paying for is:
            </p>
            <p className="mt-1 font-mono">
              {math.amountToCall} ÷ {math.potBeforeCall + math.amountToCall} ={' '}
              <span className="text-amber-300">{math.potOddsPercent.toFixed(1)}%</span>
            </p>
            <p className="mt-1 text-slate-400">
              That's the <span className="text-slate-200">break-even point</span>: if you win more often than{' '}
              {math.potOddsPercent.toFixed(1)}% of the time, calling makes money over the long run; less often, it loses.
              {math.amountToCall > 0 && (
                <>
                  {' '}In odds terms that's about{' '}
                  <span className="text-slate-200">
                    {(math.potBeforeCall / math.amountToCall).toFixed(1)}-to-1
                  </span>{' '}
                  ({math.potBeforeCall} to win vs {math.amountToCall} to call).
                </>
              )}
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-200">3. Compare</div>
            <p className="mt-0.5">
              Equity {equity.toFixed(1)}% {beatsOdds ? '≥' : '<'} pot odds {math.potOddsPercent.toFixed(1)}% →{' '}
              <span className={beatsOdds ? 'text-emerald-300' : 'text-rose-300'}>
                {beatsOdds ? 'calling is +EV' : 'calling loses chips on average'}
              </span>
              . Coach suggests <span className="capitalize text-amber-300">{suggested}</span>.
            </p>
          </div>
        </>
      ) : (
        <div>
          <div className="font-semibold text-slate-200">2. No bet to call</div>
          <p className="mt-0.5 text-slate-400">
            Nothing to call, so it's a free decision: bet for value with a strong hand, otherwise check. With{' '}
            {equity.toFixed(1)}% equity the coach suggests <span className="capitalize text-amber-300">{suggested}</span>.
          </p>
        </div>
      )}
      <div className="border-t border-slate-800 pt-2">
        <div className="font-semibold text-slate-200">Quick mental shortcut: the rule of 2 &amp; 4</div>
        <p className="mt-0.5 text-slate-400">
          Count your <span className="text-slate-200">outs</span> (cards that make your hand). On the flop, × 4 ≈ your %
          to hit by the river; on the turn, × 2. Example: two diamonds + two on the flop = 9 more diamonds (13 − 4) ≈ 9
          outs → 9 × 4 ≈ <span className="text-emerald-300">36%</span> to make the flush.
        </p>
      </div>
    </div>
  );
}

function chenLabel(score: number): { label: string; tone: string } {
  if (score >= 10) return { label: 'Premium', tone: 'text-emerald-400' };
  if (score >= 8) return { label: 'Strong', tone: 'text-emerald-300' };
  if (score >= 6) return { label: 'Playable', tone: 'text-amber-300' };
  if (score >= 4) return { label: 'Marginal', tone: 'text-orange-300' };
  return { label: 'Weak', tone: 'text-rose-400' };
}

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const rankLabel = (r: Card['rank']) => (r === 'T' ? '10' : r);

function StartingHandRating({ cards, open, onToggle }: { cards: Card[]; open: boolean; onToggle: () => void }) {
  const score = chenScore(cards);
  const { label, tone } = chenLabel(score);
  const text = cards.map((c) => `${rankLabel(c.rank)}${SUIT_CHARS[c.suit]}`).join(' ');
  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 text-sm">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">Starting hand</span>
          <span className="font-mono text-slate-300">{text}</span>
          <span className={`font-semibold ${tone}`}>{label}</span>
          <span className="text-xs text-slate-500">(Chen {score})</span>
        </span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
          <p className="mb-1">
            This uses the <span className="text-slate-300">Chen formula</span>, a quick way to score a starting hand:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>High card points: A=10, K=8, Q=7, J=6, others = rank ÷ 2.</li>
            <li>Pairs double the card value (minimum 5).</li>
            <li>+2 if suited; subtract points for gaps between the two cards.</li>
            <li>+1 for low connectors that can make straights.</li>
          </ul>
          <p className="mt-1">Roughly: 10+ premium, 8–9 strong, 6–7 playable, 4–5 marginal, below 4 is best folded from most spots.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">
      <span className="text-slate-400">{label}:</span> <span className="font-semibold text-slate-100">{value}</span>
    </span>
  );
}

function QuickBet({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600"
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  onClick,
  tone,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  tone: 'primary' | 'danger' | 'neutral';
  disabled?: boolean;
  active?: boolean;
}) {
  const tones = {
    primary: 'bg-emerald-600 hover:bg-emerald-500',
    danger: 'bg-rose-700 hover:bg-rose-600',
    neutral: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors ${tones[tone]} ${
        disabled ? 'cursor-not-allowed opacity-40 saturate-50' : ''
      } ${active ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900' : ''}`}
    >
      {active ? `✓ ${label}` : label}
    </button>
  );
}
