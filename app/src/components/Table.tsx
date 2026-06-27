import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { useGame } from '../hooks/useGame';
import { HandHistoryPanel } from './HandHistoryPanel';
import { ExportControls } from './ExportControls';
import { HAND_RANK_NAMES } from '../engine/evaluator';
import type { ActionType } from '../engine/betting';
import { PokerCanvas } from '../pixi/PokerCanvas';
import { soundManager, type SfxName } from '../sound/SoundManager';
import { chenScore } from '../engine/preflop';
import type { CoachMath } from '../coach/coach';
import type { Card } from '../engine/deck';

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
  const [openPanel, setOpenPanel] = useState<'history' | 'export' | null>(null);
  const [paused, setPaused] = useState(false);
  const prevSecLeftRef = useRef<number | null>(null);
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

  // Reset the bet sizing slider to a sensible default whenever it's the human's turn.
  useEffect(() => {
    if (validActions) {
      const opening = validActions.types.includes('raise') ? validActions.minRaiseTo : currentLevel.bigBlind;
      setRaiseAmount(Math.min(validActions.maxRaiseTo, opening));
    }
  }, [validActions, currentLevel.bigBlind]);

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

  // Auto-advance to the next hand a few seconds after a hand ends, unless paused.
  // nextHand's identity changes every render, so we call it via a ref and key the
  // effect on a stable boolean + handNumber — otherwise the 1s clock tick would
  // re-run this effect and reset the timer before it could ever fire.
  const nextHandRef = useRef(nextHand);
  nextHandRef.current = nextHand;
  const handOver = !!engine && engine.isHandOver();
  useEffect(() => {
    if (!handOver || paused) return;
    const t = setTimeout(() => nextHandRef.current(), 3500);
    return () => clearTimeout(t);
  }, [handOver, paused, handNumber]);

  function toggleMuted() {
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
    if (!next) soundManager.play('click');
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
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-6 overflow-hidden bg-slate-950 px-4 text-center">
        <div
          className={`pointer-events-none absolute inset-0 ${
            won
              ? 'bg-[radial-gradient(ellipse_at_center,_rgba(234,179,8,0.25),_transparent_65%)]'
              : 'bg-[radial-gradient(ellipse_at_center,_rgba(190,18,60,0.18),_transparent_65%)]'
          }`}
        />
        {won && <CoinBurst />}
        <div className="animate-pop relative">
          {won ? (
            <>
              <div className="text-6xl">🏆</div>
              <h1 className="mt-3 text-4xl font-extrabold text-amber-300">Champion!</h1>
              <p className="mt-2 text-lg text-slate-200">You are the winner — everyone else is out of chips.</p>
            </>
          ) : (
            <>
              <div className="text-6xl">💀</div>
              <h1 className="mt-3 text-4xl font-extrabold text-rose-400">Game over</h1>
              <p className="mt-2 text-lg text-slate-300">You're out of chips. Better luck next time.</p>
            </>
          )}
        </div>
        <button
          onClick={onExit}
          className="relative rounded-xl bg-emerald-600 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-emerald-500"
        >
          Play again
        </button>
      </div>
    );
  }

  const isHandOver = engine.isHandOver();
  const human = engine.players.find((p) => p.id === 'human')!;
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
      {/* Top bar — compact single row that scrolls horizontally if it overflows. */}
      <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <button onClick={onExit} className="shrink-0 rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            ←
          </button>
          <span className="shrink-0 font-semibold">#{handNumber}</span>
          {setup.scenarioName && (
            <span className="shrink-0 rounded-full bg-purple-900/60 px-2 py-0.5 text-xs text-purple-200">{setup.scenarioName}</span>
          )}
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
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-lg bg-emerald-950/70 px-2.5 py-1 font-mono text-sm font-bold text-emerald-300 ring-1 ring-emerald-600/40">
            💰 {human.stack}
          </span>
          <button
            onClick={() => setCoachEnabled((v) => !v)}
            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
              coachEnabled ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="Leaks are still tracked in the background even when the coach panel is hidden."
          >
            Coach
          </button>
          <button
            onClick={toggleMuted}
            className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            title="Toggle sound effects"
          >
            {muted ? '🔇' : '🔊'}
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
            className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            title="Toggle fullscreen"
          >
            ⛶
          </button>
        </div>
      </div>

      {/* Win celebration — coin burst + banner when you take down the pot. */}
      {isHandOver && payouts['human'] > 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-start justify-center px-4 pt-[18vh]">
          <CoinBurst />
          <div className="animate-pop relative rounded-2xl border-2 border-amber-400 bg-amber-500/95 px-8 py-4 text-center shadow-2xl shadow-amber-900/50">
            <div className="text-3xl font-extrabold text-slate-900">🎉 You win {payouts['human']}!</div>
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
              portrait: setup.seats.find((s) => s.id === p.id)?.profile?.portrait,
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
            <div className="animate-fade-up mt-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-500/40 bg-indigo-950/40 p-3 text-sm text-slate-300">
              <span>Decide your play first — then check the coach's take.</span>
              <button
                onClick={() => setCoachRevealed(true)}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Reveal suggestion
              </button>
            </div>
          );
        }
        const shown = liveTurn ? advice : heldAdvice;
        if (!shown) return null;
        return (
          <div className="animate-fade-up mt-4 rounded-xl border border-indigo-500/40 bg-indigo-950/40 p-3 text-sm text-slate-200">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Coach</span>
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
      {validActions && (
        <div className="animate-fade-up order-first mt-2 rounded-xl border border-emerald-600/50 bg-slate-900/90 p-3 ring-1 ring-emerald-500/30">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-300">● Your turn</span>
            {actionSecondsLeft != null && (
              <span className={`font-mono text-sm font-bold ${actionSecondsLeft <= 5 ? 'text-rose-400' : 'text-slate-300'}`}>
                {actionSecondsLeft}s
              </span>
            )}
          </div>
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
          {/* Buttons on the left, bet sizing on the right (stacks on narrow screens). */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap gap-2">
              {validActions.types.includes('fold') && (
                <ActionButton label="Fold" tone="danger" onClick={() => humanAct('fold')} />
              )}
              {validActions.types.includes('check') && (
                <ActionButton label="Check" tone="neutral" onClick={() => humanAct('check')} />
              )}
              {validActions.types.includes('call') && (
                <ActionButton label={`Call ${validActions.callAmount}`} tone="primary" onClick={() => humanAct('call')} />
              )}
              {validActions.types.includes('bet') && (
                <ActionButton label={`Bet ${raiseAmount}`} tone="primary" onClick={() => humanAct('bet', raiseAmount)} />
              )}
              {validActions.types.includes('raise') && (
                <ActionButton label={`Raise to ${raiseAmount}`} tone="primary" onClick={() => humanAct('raise', raiseAmount)} />
              )}
              {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
                <ActionButton
                  label={`All in ${validActions.maxRaiseTo}`}
                  tone="danger"
                  onClick={() =>
                    humanAct(validActions.types.includes('raise') ? 'raise' : 'bet', validActions.maxRaiseTo)
                  }
                />
              )}
            </div>
            {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
              <div className="flex items-center gap-3 lg:flex-1">
                <input
                  type="range"
                  min={validActions.types.includes('raise') ? validActions.minRaiseTo : currentLevel.bigBlind}
                  max={validActions.maxRaiseTo}
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <span className="w-16 text-right font-mono text-amber-200">{raiseAmount}</span>
                <div className="flex gap-1">
                  <QuickBet label="½" onClick={() => setRaiseAmount(clamp(Math.round(potTotal * 0.5), validActions, currentLevel.bigBlind))} />
                  <QuickBet label="pot" onClick={() => setRaiseAmount(clamp(potTotal, validActions, currentLevel.bigBlind))} />
                  <QuickBet label="max" onClick={() => setRaiseAmount(validActions.maxRaiseTo)} />
                </div>
              </div>
            )}
          </div>
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
              <span className="font-semibold">{engine.players.find((p) => p.id === id)?.name}</span> won {amount}
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

      <div className="mt-4 space-y-2">
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
      <div>
        <div className="font-semibold text-slate-200">1. Equity — your chance to win</div>
        <p className="mt-0.5 text-slate-400">
          Simulated {math.iterations.toLocaleString()} random run-outs against {math.numOpponents} opponent
          {math.numOpponents === 1 ? '' : 's'}:
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
            <p className="mt-0.5 font-mono">
              call {math.amountToCall} ÷ (pot {math.potBeforeCall} + call {math.amountToCall}) ={' '}
              <span className="text-amber-300">{math.potOddsPercent.toFixed(1)}%</span>
            </p>
            <p className="mt-0.5 text-slate-400">
              You need at least {math.potOddsPercent.toFixed(1)}% equity for a call to break even.
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

function StartingHandRating({ cards, open, onToggle }: { cards: Card[]; open: boolean; onToggle: () => void }) {
  const score = chenScore(cards);
  const { label, tone } = chenLabel(score);
  const text = cards.map((c) => `${c.rank}${SUIT_CHARS[c.suit]}`).join(' ');
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
}: {
  label: string;
  onClick: () => void;
  tone: 'primary' | 'danger' | 'neutral';
}) {
  const tones = {
    primary: 'bg-emerald-600 hover:bg-emerald-500',
    danger: 'bg-rose-700 hover:bg-rose-600',
    neutral: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors ${tones[tone]}`}
    >
      {label}
    </button>
  );
}
