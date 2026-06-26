import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { useGame } from '../hooks/useGame';
import { HandHistoryPanel } from './HandHistoryPanel';
import { ExportControls } from './ExportControls';
import { HAND_RANK_NAMES } from '../engine/evaluator';
import type { ActionType } from '../engine/betting';
import { PokerCanvas } from '../pixi/PokerCanvas';
import { soundManager, type SfxName } from '../sound/SoundManager';
import { chenScore } from '../engine/preflop';
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
    levelNumber,
    nextLevel,
    msLeftInLevel,
    scheduleName,
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
  const feltObserverRef = useRef<ResizeObserver | null>(null);
  const feltResizeRef = useRef<() => void>(() => {});
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
    const update = (width: number) => {
      // Fit the table within BOTH the container width and the remaining
      // viewport height. On a phone in landscape the container is wide but
      // short, so a width-only sizing made the table taller than the screen
      // and you couldn't see the whole felt — clamp by available height too.
      const cw = Math.max(320, Math.floor(width));
      const top = el.getBoundingClientRect().top;
      const availH = window.innerHeight - top - 150; // leave room for the action controls below
      let w = cw;
      let h = Math.round(w / ASPECT);
      if (availH > 120 && h > availH) {
        h = Math.floor(availH);
        w = Math.min(cw, Math.round(h * ASPECT));
        h = Math.round(w / ASPECT);
      }
      setCanvasSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    const onResize = () => update(el.clientWidth);
    feltResizeRef.current = onResize;
    update(el.clientWidth);
    const observer = new ResizeObserver((entries) => update(entries[0].contentRect.width));
    observer.observe(el);
    feltObserverRef.current = observer;
    // Orientation/viewport-height changes don't always change the container
    // width (which is what ResizeObserver watches), so listen for them too.
    window.addEventListener('resize', onResize);
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

  function toggleMuted() {
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
    if (!next) soundManager.play('click');
  }

  if (!engine) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-slate-300">
        <p>Not enough players have chips to continue.</p>
        <button onClick={onExit} className="rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500">
          Back to setup
        </button>
      </div>
    );
  }

  const isHandOver = engine.isHandOver();
  const human = engine.players.find((p) => p.id === 'human')!;
  const leaks = leakTracker.topLeaks();
  const payouts = engine.showdownResult?.payouts ?? {};
  const bestHands = engine.showdownResult?.bestHandByPlayer ?? {};

  const sbPlayerId = engine.smallBlindId;
  const bbPlayerId = engine.bigBlindId;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col overflow-x-hidden px-3 py-3 sm:px-4">
      {/* Top bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
        <button onClick={onExit} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          ← Setup
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span>Hand #{handNumber}</span>
          {setup.scenarioName && (
            <span className="rounded-full bg-purple-900/60 px-3 py-1 text-xs text-purple-200">{setup.scenarioName}</span>
          )}
          <span className="rounded-full bg-slate-800 px-3 py-1 capitalize text-emerald-300">{engine.street}</span>
          <div className="flex flex-wrap items-center gap-2" title={nextLevel ? `Next: ${nextLevel.smallBlind}/${nextLevel.bigBlind}` : 'Top level reached'}>
            <span>
              Blinds {currentLevel.smallBlind}/{currentLevel.bigBlind}
              {currentLevel.ante > 0 && <span className="text-slate-400"> (ante {currentLevel.ante})</span>}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-amber-200">
              {scheduleName} L{levelNumber}
              {Number.isFinite(msLeftInLevel) && ` · ${formatClock(msLeftInLevel)}`}
            </span>
          </div>
          <button
            onClick={() => setCoachEnabled((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              coachEnabled ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="Leaks are still tracked in the background even when the coach panel is hidden."
          >
            Coach: {coachEnabled ? 'On' : 'Off'}
          </button>
          <button
            onClick={toggleMuted}
            className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            title="Toggle sound effects"
          >
            {muted ? '🔇 Muted' : '🔊 Sound'}
          </button>
        </div>
        <span className="font-mono">Your stack: {human.stack}</span>
      </div>

      {/* Felt */}
      <div ref={feltRef} className="mx-auto flex w-full max-w-4xl justify-center overflow-hidden">
        <PokerCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          potTotal={potTotal}
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
            };
          })}
        />
      </div>

      {/* Starting-hand rating (click to expand) */}
      {engine.street === 'preflop' && human.holeCards.length === 2 && !isHandOver && (
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
          </div>
        );
      })()}

      {/* Action bar */}
      {validActions && (
        <div className="animate-fade-up mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
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
          {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
            <div className="mb-3 flex items-center gap-3">
              <input
                type="range"
                min={validActions.types.includes('raise') ? validActions.minRaiseTo : currentLevel.bigBlind}
                max={validActions.maxRaiseTo}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-20 text-right font-mono text-amber-200">{raiseAmount}</span>
              <div className="flex gap-1">
                <QuickBet label="½ pot" onClick={() => setRaiseAmount(clamp(Math.round(potTotal * 0.5), validActions, currentLevel.bigBlind))} />
                <QuickBet label="pot" onClick={() => setRaiseAmount(clamp(potTotal, validActions, currentLevel.bigBlind))} />
                <QuickBet label="max" onClick={() => setRaiseAmount(validActions.maxRaiseTo)} />
              </div>
            </div>
          )}
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

      <HandHistoryPanel history={handHistory} />
      <ExportControls
        setup={setup}
        handHistory={handHistory}
        leakTracker={leakTracker}
        blinds={{ smallBlind: currentLevel.smallBlind, bigBlind: currentLevel.bigBlind }}
      />
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
