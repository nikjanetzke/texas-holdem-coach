import { useMemo, useState } from 'react';
import type { HandRecord } from '../hooks/useGame';
import { CardView } from './CardView';

interface ReplayStep {
  communityCards: number;
  description: string;
}

function buildSteps(record: HandRecord): ReplayStep[] {
  const steps: ReplayStep[] = [{ communityCards: 0, description: 'Hand starts — hole cards dealt, blinds posted.' }];
  const streetCardCounts: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  let lastStreet = 'preflop';
  for (const entry of record.actionLog) {
    if (entry.street !== lastStreet) {
      lastStreet = entry.street;
      steps.push({ communityCards: streetCardCounts[entry.street] ?? 5, description: `— ${entry.street} —` });
    }
    const playerName = record.players.find((p) => p.id === entry.playerId)?.name ?? entry.playerId;
    const amountText = entry.amount ? ` ${entry.amount}` : '';
    steps.push({ communityCards: streetCardCounts[lastStreet] ?? 0, description: `${playerName} ${entry.type}${amountText}` });
  }
  if (record.showdownResult) {
    const payoutText = Object.entries(record.showdownResult.payouts)
      .map(([id, amount]) => `${record.players.find((p) => p.id === id)?.name ?? id} wins ${amount}`)
      .join(', ');
    steps.push({ communityCards: record.communityCards.length, description: `Showdown — ${payoutText}` });
  }
  return steps;
}

function ReplayModal({ record, onClose }: { record: HandRecord; onClose: () => void }) {
  const steps = useMemo(() => buildSteps(record), [record]);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold text-slate-100">Hand #{record.handNumber} replay</span>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            ✕
          </button>
        </div>

        <div className="mb-3 flex justify-center gap-2">
          {record.communityCards.slice(0, step.communityCards).map((c) => (
            <CardView key={`${c.rank}${c.suit}`} card={c} size="md" />
          ))}
          {step.communityCards === 0 && <span className="text-xs italic text-slate-500">— pre-flop —</span>}
        </div>

        <div className="mb-3 space-y-1">
          {record.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-24 truncate text-slate-300">{p.name}</span>
              <div className="flex gap-1">
                {p.holeCards.map((c, i) => (
                  <CardView key={i} card={c} size="sm" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3 min-h-[2.5rem] rounded bg-slate-800 px-3 py-2 text-amber-200">{step.description}</div>

        <div className="flex items-center justify-between">
          <button
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="rounded bg-slate-700 px-3 py-1 font-medium hover:bg-slate-600 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">
            Step {stepIndex + 1} / {steps.length}
          </span>
          <button
            disabled={stepIndex === steps.length - 1}
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            className="rounded bg-slate-700 px-3 py-1 font-medium hover:bg-slate-600 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export function HandHistoryPanel({ history }: { history: HandRecord[] }) {
  const [selected, setSelected] = useState<HandRecord | null>(null);

  if (history.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
      <div className="mb-1 font-semibold text-slate-300">Hand history</div>
      <div className="flex flex-wrap gap-1">
        {history.map((record) => {
          const winners = record.showdownResult
            ? Object.keys(record.showdownResult.payouts)
                .map((id) => record.players.find((p) => p.id === id)?.name ?? id)
                .join(', ')
            : '';
          return (
            <button
              key={record.handNumber}
              onClick={() => setSelected(record)}
              className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
              title={winners}
            >
              #{record.handNumber}
            </button>
          );
        })}
      </div>
      {selected && <ReplayModal record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
