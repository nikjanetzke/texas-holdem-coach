import { useEffect, useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { useGame } from '../hooks/useGame';
import { CardView } from './CardView';
import { Seat } from './Seat';
import { Chips } from './Chips';
import { HandHistoryPanel } from './HandHistoryPanel';
import { HAND_RANK_NAMES } from '../engine/evaluator';
import type { ActionType } from '../engine/betting';

function seatPosition(index: number, total: number) {
  // index 0 sits at the bottom (the human); the rest fan out clockwise around an oval.
  const theta = (index / total) * 2 * Math.PI;
  const x = 50 + 46 * Math.sin(theta);
  const y = 50 + 43 * Math.cos(theta);
  // Bet chips are nudged from the seat toward the centre of the felt.
  const chipX = x + (50 - x) * 0.3;
  const chipY = y + (50 - y) * 0.3;
  return { x, y, chipX, chipY };
}

export function Table({ setup, onExit }: { setup: GameSetup; onExit: () => void }) {
  const { engine, potTotal, currentActorId, advice, handSummary, handNumber, leakTracker, humanAct, nextHand, handHistory } =
    useGame(setup);
  const [raiseAmount, setRaiseAmount] = useState(0);

  const validActions =
    engine && !engine.isHandOver() && currentActorId === 'human' ? engine.getValidActions('human') : null;

  // Reset the bet sizing slider to a sensible default whenever it's the human's turn.
  useEffect(() => {
    if (validActions) {
      const opening = validActions.types.includes('raise') ? validActions.minRaiseTo : setup.bigBlind;
      setRaiseAmount(Math.min(validActions.maxRaiseTo, opening));
    }
  }, [validActions, setup.bigBlind]);

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

  // Blinds are always the first two actions posted in a hand.
  const sbPlayerId = engine.actionLog[0]?.playerId;
  const bbPlayerId = engine.actionLog[1]?.playerId;

  const total = engine.players.length;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-3">
      {/* Top bar */}
      <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
        <button onClick={onExit} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          ← Setup
        </button>
        <div className="flex items-center gap-4">
          <span>Hand #{handNumber}</span>
          <span className="rounded-full bg-slate-800 px-3 py-1 capitalize text-emerald-300">{engine.street}</span>
          <span>
            Blinds {setup.smallBlind}/{setup.bigBlind}
          </span>
        </div>
        <span className="font-mono">Your stack: {human.stack}</span>
      </div>

      {/* Felt */}
      <div className="relative mx-auto aspect-[16/10] w-full max-w-4xl">
        <div className="absolute inset-0 rounded-[48%] border-[10px] border-amber-950/80 bg-gradient-to-b from-emerald-700 to-emerald-900 shadow-2xl shadow-black/60">
          <div className="absolute inset-6 rounded-[48%] border border-emerald-400/10" />
        </div>

        {/* Centre: community cards + pot */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <div className="flex min-h-[80px] items-center justify-center gap-2">
            {engine.communityCards.length === 0 ? (
              <span className="text-sm italic text-emerald-200/50">— pre-flop —</span>
            ) : (
              engine.communityCards.map((c) => <CardView key={`${c.rank}${c.suit}`} card={c} size="lg" animate />)
            )}
          </div>
          <div className="animate-pot rounded-full bg-slate-950/70 px-4 py-1 text-sm font-semibold text-amber-200 ring-1 ring-amber-400/40">
            Pot: {potTotal}
          </div>
        </div>

        {/* Seats */}
        {engine.players.map((p, idx) => {
          const pos = seatPosition(idx, total);
          const showCards = p.id === 'human' || (isHandOver && !p.folded && !!engine.showdownResult);
          const handLabel =
            isHandOver && bestHands[p.id] ? HAND_RANK_NAMES[bestHands[p.id].rank] : undefined;
          return (
            <div key={p.id}>
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <Seat
                  player={p}
                  isDealer={idx === engine.dealerSeat}
                  isSmallBlind={p.id === sbPlayerId}
                  isBigBlind={p.id === bbPlayerId}
                  isActing={p.id === currentActorId && !isHandOver}
                  isWinner={!!payouts[p.id]}
                  showCards={showCards}
                  handLabel={handLabel}
                />
              </div>
              {p.streetContributed > 0 && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pos.chipX}%`, top: `${pos.chipY}%` }}
                >
                  <Chips amount={p.streetContributed} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coach panel */}
      {advice && currentActorId === 'human' && !isHandOver && (
        <div className="animate-fade-up mt-4 rounded-xl border border-indigo-500/40 bg-indigo-950/40 p-3 text-sm text-slate-200">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Coach</span>
            <span className="font-semibold">
              Suggests: <span className="text-amber-300 capitalize">{advice.suggestedAction}</span>
            </span>
            <Stat label="Hand" value={advice.handStrengthLabel} />
            <Stat label="Equity" value={`${advice.equityPercent.toFixed(0)}%`} />
            <Stat label="Pot odds" value={`${advice.potOddsPercent.toFixed(0)}%`} />
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-slate-300">
            {advice.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {advice.warnings.map((w, i) => (
            <div key={i} className="mt-1 text-amber-400">
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {validActions && (
        <div className="animate-fade-up mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
          {(validActions.types.includes('bet') || validActions.types.includes('raise')) && (
            <div className="mb-3 flex items-center gap-3">
              <input
                type="range"
                min={validActions.types.includes('raise') ? validActions.minRaiseTo : setup.bigBlind}
                max={validActions.maxRaiseTo}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-20 text-right font-mono text-amber-200">{raiseAmount}</span>
              <div className="flex gap-1">
                <QuickBet label="½ pot" onClick={() => setRaiseAmount(clamp(Math.round(potTotal * 0.5), validActions, setup.bigBlind))} />
                <QuickBet label="pot" onClick={() => setRaiseAmount(clamp(potTotal, validActions, setup.bigBlind))} />
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

      {/* Hand result */}
      {isHandOver && engine.showdownResult && (
        <div className="animate-fade-up mt-4 rounded-xl border border-emerald-600/50 bg-slate-900/80 p-3 text-sm text-slate-200">
          <div className="mb-1 font-semibold text-emerald-300">Hand result</div>
          {Object.entries(payouts).map(([id, amount]) => (
            <div key={id}>
              <span className="font-semibold">{engine.players.find((p) => p.id === id)?.name}</span> won {amount}
            </div>
          ))}
          {handSummary && handSummary.length > 0 && (
            <div className="mt-2 space-y-0.5 text-slate-300">
              {handSummary.map((s, i) => (
                <div key={i}>
                  <span className={s.score >= 7 ? 'text-emerald-400' : s.score >= 5 ? 'text-amber-400' : 'text-rose-400'}>
                    Decision score {s.score}/10
                  </span>{' '}
                  — {s.explanation}
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
      {leaks.length > 0 && (
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
    </div>
  );
}

function clamp(value: number, valid: { minRaiseTo: number; maxRaiseTo: number; types: ActionType[] }, bb: number) {
  const min = valid.types.includes('raise') ? valid.minRaiseTo : bb;
  return Math.max(min, Math.min(valid.maxRaiseTo, value));
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
