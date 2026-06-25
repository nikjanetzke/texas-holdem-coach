import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { useGame } from '../hooks/useGame';
import { CardView } from './CardView';
import type { ActionType } from '../engine/betting';

export function Table({ setup }: { setup: GameSetup }) {
  const { engine, potTotal, currentActorId, advice, handSummary, handNumber, leakTracker, humanAct, nextHand } = useGame(setup);
  const [raiseAmount, setRaiseAmount] = useState(0);

  if (!engine) {
    return <div className="text-center mt-16 text-slate-300">Waiting for players with chips to continue...</div>;
  }

  const isHandOver = engine.isHandOver();
  const human = engine.players.find((p) => p.id === 'human')!;
  const validActions = !isHandOver && currentActorId === 'human' ? engine.getValidActions('human') : null;
  const leaks = leakTracker.topLeaks();

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-3 text-slate-300 text-sm">
        <span>Hand #{handNumber}</span>
        <span>Pot: {potTotal}</span>
        <span>Street: {engine.street}</span>
      </div>

      <div className="rounded-2xl bg-emerald-900 border-4 border-emerald-950 p-6 mb-4">
        <div className="flex justify-center gap-2 mb-4 min-h-[64px]">
          {engine.communityCards.map((c, i) => (
            <CardView key={i} card={c} />
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {engine.players.map((p, idx) => {
            const isDealer = idx === engine.dealerSeat;
            const isActing = p.id === currentActorId && !isHandOver;
            const showCards = p.id === 'human' || (isHandOver && !p.folded);
            return (
              <div
                key={p.id}
                className={`rounded-lg p-2 border ${isActing ? 'border-yellow-400 bg-emerald-800' : 'border-emerald-700 bg-emerald-800/60'} ${p.folded ? 'opacity-40' : ''}`}
              >
                <div className="flex justify-between items-center text-xs text-slate-200 mb-1">
                  <span className="font-semibold">{p.name}{isDealer ? ' (D)' : ''}</span>
                  <span>{p.stack}</span>
                </div>
                <div className="flex gap-1 mb-1">
                  {p.holeCards.map((c, i) => (
                    <CardView key={i} card={showCards ? c : undefined} hidden={!showCards} size="sm" />
                  ))}
                </div>
                {p.streetContributed > 0 && (
                  <div className="text-xs text-amber-300">Bet: {p.streetContributed}</div>
                )}
                {p.folded && <div className="text-xs text-slate-400">Folded</div>}
              </div>
            );
          })}
        </div>
      </div>

      {advice && currentActorId === 'human' && !isHandOver && (
        <div className="rounded-lg bg-slate-800 border border-slate-600 p-3 mb-4 text-sm text-slate-200">
          <div className="font-semibold mb-1">Coach: suggests {advice.suggestedAction}</div>
          <div className="text-slate-300 mb-1">Hand strength: {advice.handStrengthLabel} ({advice.equityPercent.toFixed(0)}% equity) — Pot odds need {advice.potOddsPercent.toFixed(0)}%</div>
          <ul className="list-disc list-inside space-y-0.5">
            {advice.reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {advice.warnings.map((w, i) => (
            <div key={i} className="text-amber-400 mt-1">⚠ {w}</div>
          ))}
        </div>
      )}

      {validActions && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          {validActions.types.map((type) => {
            if (type === 'bet' || type === 'raise') {
              const target = type === 'raise' ? validActions.minRaiseTo : Math.min(validActions.maxRaiseTo, Math.max(setup.bigBlind, raiseAmount));
              return (
                <div key={type} className="flex items-center gap-1">
                  <input
                    type="number"
                    min={validActions.minRaiseTo}
                    max={validActions.maxRaiseTo}
                    value={raiseAmount || target}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="w-20 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-sm"
                  />
                  <ActionButton label={type === 'raise' ? 'Raise to' : 'Bet'} onClick={() => humanAct(type as ActionType, raiseAmount || target)} />
                </div>
              );
            }
            const label = type === 'call' ? `Call ${validActions.callAmount}` : type[0].toUpperCase() + type.slice(1);
            return <ActionButton key={type} label={label} onClick={() => humanAct(type as ActionType)} />;
          })}
        </div>
      )}

      {isHandOver && engine.showdownResult && (
        <div className="rounded-lg bg-slate-800 border border-slate-600 p-3 mb-4 text-sm text-slate-200">
          <div className="font-semibold mb-1">Hand result</div>
          {Object.entries(engine.showdownResult.payouts).map(([id, amount]) => (
            <div key={id}>{engine.players.find((p) => p.id === id)?.name} won {amount}</div>
          ))}
          {handSummary && handSummary.length > 0 && (
            <div className="mt-2">
              {handSummary.map((s, i) => (
                <div key={i}>Decision score: {s.score}/10 — {s.explanation}</div>
              ))}
            </div>
          )}
          <button onClick={nextHand} className="mt-3 rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-semibold">
            Next hand
          </button>
        </div>
      )}

      {leaks.length > 0 && (
        <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 text-xs text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">Leaks to watch</div>
          {leaks.map((l) => (
            <div key={l.leak}>{l.leak}: {l.count} time{l.count === 1 ? '' : 's'} ({l.percentOfHands.toFixed(0)}% of decisions)</div>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-500 mt-4">Your stack: {human.stack}</div>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium">
      {label}
    </button>
  );
}
