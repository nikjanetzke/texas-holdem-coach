import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { buildDefaultSeats } from '../hooks/useGame';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID } from '../engine/blinds';

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [numPlayers, setNumPlayers] = useState(6);
  const [startingStack, setStartingStack] = useState(1000);
  const [scheduleId, setScheduleId] = useState(DEFAULT_SCHEDULE_ID);

  return (
    <div className="max-w-md mx-auto mt-16 p-6 rounded-xl border border-slate-700 bg-slate-900 text-slate-100">
      <h1 className="text-2xl font-bold mb-1">Texas Hold'em Coach</h1>
      <p className="text-slate-400 mb-6">Practice hands and get plain-English coaching as you play.</p>

      <label className="block mb-4">
        <span className="block text-sm text-slate-300 mb-1">Number of players (2-10)</span>
        <input
          type="number"
          min={2}
          max={10}
          value={numPlayers}
          onChange={(e) => setNumPlayers(Math.min(10, Math.max(2, Number(e.target.value))))}
          className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
        />
      </label>

      <label className="block mb-4">
        <span className="block text-sm text-slate-300 mb-1">Starting chips</span>
        <input
          type="number"
          min={100}
          step={100}
          value={startingStack}
          onChange={(e) => setStartingStack(Number(e.target.value))}
          className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
        />
      </label>

      <div className="block mb-6">
        <span className="block text-sm text-slate-300 mb-2">Blind schedule</span>
        <div className="space-y-2">
          {Object.values(BLIND_SCHEDULES).map((s) => {
            const selected = s.id === scheduleId;
            return (
              <button
                key={s.id}
                onClick={() => setScheduleId(s.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-slate-400">{s.defaultLevelMinutes} min levels</span>
                </div>
                <div className="text-xs text-slate-400">{s.description}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-500">
                  {s.levels.slice(0, 4).map((l) => `${l.smallBlind}/${l.bigBlind}`).join(' → ')} → …
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        className="w-full rounded bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 font-semibold"
        onClick={() =>
          onStart({
            seats: buildDefaultSeats(numPlayers),
            startingStack,
            scheduleId,
          })
        }
      >
        Start playing
      </button>
    </div>
  );
}
