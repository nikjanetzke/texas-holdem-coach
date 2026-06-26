import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { buildDefaultSeats } from '../hooks/useGame';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID } from '../engine/blinds';
import { SCENARIOS } from '../scenarios/scenarios';

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [mode, setMode] = useState<'quick' | 'scenario'>('quick');
  // Kept as strings so the fields can be cleared while typing (a numeric state
  // floored at the min would otherwise pin them at "0" and refuse to empty).
  const [numPlayers, setNumPlayers] = useState('6');
  const [startingStack, setStartingStack] = useState('1000');
  const [scheduleId, setScheduleId] = useState(DEFAULT_SCHEDULE_ID);
  const [actionTimerSeconds, setActionTimerSeconds] = useState<number | null>(null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Felt-and-card backdrop for a less "blank dashboard" first impression. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,89,55,0.45),_transparent_60%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-700/20 blur-3xl" />

      <div className="relative mx-auto max-w-md px-4 pt-16 pb-10">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center gap-2 text-3xl">
            <span>🂡</span>
            <span className="text-amber-300">♠</span>
            <span className="text-rose-400">♥</span>
            <span>🂮</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Texas Hold'em Coach</h1>
          <p className="mt-1 text-slate-400">Practice hands and get plain-English coaching as you play.</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-6 text-slate-100 shadow-2xl shadow-black/40">
          <div className="mb-6 flex rounded-lg bg-slate-800 p-1">
            <ModeTab label="Quick game" active={mode === 'quick'} onClick={() => setMode('quick')} />
            <ModeTab label="Scenario" active={mode === 'scenario'} onClick={() => setMode('scenario')} />
          </div>

          {mode === 'scenario' ? (
            <div className="space-y-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onStart(s.build())}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left transition-colors hover:border-emerald-500 hover:bg-slate-700"
                >
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.description}</div>
                </button>
              ))}
            </div>
          ) : (
            <QuickGameForm
              numPlayers={numPlayers}
              setNumPlayers={setNumPlayers}
              startingStack={startingStack}
              setStartingStack={setStartingStack}
              scheduleId={scheduleId}
              setScheduleId={setScheduleId}
              actionTimerSeconds={actionTimerSeconds}
              setActionTimerSeconds={setActionTimerSeconds}
              onStart={onStart}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Parse a possibly-empty/garbage input string, falling back to `fallback` and
// clamping into [min, max].
function clampInt(value: string, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || value.trim() === '') return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function QuickGameForm({
  numPlayers,
  setNumPlayers,
  startingStack,
  setStartingStack,
  scheduleId,
  setScheduleId,
  actionTimerSeconds,
  setActionTimerSeconds,
  onStart,
}: {
  numPlayers: string;
  setNumPlayers: (n: string) => void;
  startingStack: string;
  setStartingStack: (n: string) => void;
  scheduleId: string;
  setScheduleId: (id: string) => void;
  actionTimerSeconds: number | null;
  setActionTimerSeconds: (n: number | null) => void;
  onStart: (setup: GameSetup) => void;
}) {
  return (
    <>
      <label className="block mb-4">
        <span className="block text-sm text-slate-300 mb-1">Number of players (2-10)</span>
        <input
          type="number"
          min={2}
          max={10}
          value={numPlayers}
          onChange={(e) => setNumPlayers(e.target.value)}
          onBlur={(e) => setNumPlayers(String(clampInt(e.target.value, 2, 10, 6)))}
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
          onChange={(e) => setStartingStack(e.target.value)}
          onBlur={(e) => setStartingStack(String(clampInt(e.target.value, 100, 1_000_000, 1000)))}
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

      <label className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
        <span>
          <span className="block text-sm text-slate-200">Action timer</span>
          <span className="block text-xs text-slate-400">Auto-fold (or check) if you run out of time to act.</span>
        </span>
        <span className="flex items-center gap-2">
          {actionTimerSeconds != null && (
            <input
              type="number"
              min={5}
              max={120}
              value={actionTimerSeconds}
              onChange={(e) => setActionTimerSeconds(Math.max(5, Math.min(120, Number(e.target.value))))}
              className="w-16 rounded bg-slate-900 border border-slate-600 px-2 py-1 text-right"
            />
          )}
          <button
            role="switch"
            aria-checked={actionTimerSeconds != null}
            onClick={() => setActionTimerSeconds(actionTimerSeconds != null ? null : 30)}
            className={`relative h-6 w-11 rounded-full transition-colors ${actionTimerSeconds != null ? 'bg-emerald-600' : 'bg-slate-600'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                actionTimerSeconds != null ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </span>
      </label>

      <button
        className="w-full rounded bg-emerald-600 hover:bg-emerald-500 transition-colors py-2 font-semibold"
        onClick={() =>
          onStart({
            seats: buildDefaultSeats(clampInt(numPlayers, 2, 10, 6)),
            startingStack: clampInt(startingStack, 100, 1_000_000, 1000),
            scheduleId,
            actionTimerSeconds: actionTimerSeconds ?? undefined,
          })
        }
      >
        Start playing
      </button>
    </>
  );
}
