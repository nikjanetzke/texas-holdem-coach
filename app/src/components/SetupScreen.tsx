import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { buildDefaultSeats } from '../hooks/useGame';

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [numPlayers, setNumPlayers] = useState(6);
  const [startingStack, setStartingStack] = useState(1000);
  const [bigBlind, setBigBlind] = useState(20);

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

      <label className="block mb-6">
        <span className="block text-sm text-slate-300 mb-1">Big blind</span>
        <input
          type="number"
          min={2}
          step={2}
          value={bigBlind}
          onChange={(e) => setBigBlind(Number(e.target.value))}
          className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
        />
      </label>

      <button
        className="w-full rounded bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 font-semibold"
        onClick={() =>
          onStart({
            seats: buildDefaultSeats(numPlayers),
            startingStack,
            smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
            bigBlind,
          })
        }
      >
        Start playing
      </button>
    </div>
  );
}
