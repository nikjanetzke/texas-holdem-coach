import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { buildDefaultSeats } from '../hooks/useGame';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID } from '../engine/blinds';
import { SCENARIOS } from '../scenarios/scenarios';
import { ChenTrainer } from './ChenTrainer';

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState<'quick' | 'scenario' | 'train'>('quick');
  // Kept as strings so the fields can be cleared while typing (a numeric state
  // floored at the min would otherwise pin them at "0" and refuse to empty).
  const [numPlayers, setNumPlayers] = useState('6');
  const [startingStack, setStartingStack] = useState('10000');
  const [scheduleId, setScheduleId] = useState(DEFAULT_SCHEDULE_ID);
  const [actionTimerSeconds, setActionTimerSeconds] = useState<number | null>(null);

  // Landing splash: the full Poker IQ hero with a single Start button. Clicking
  // through reveals the game menu (quick game / scenario / training).
  if (!entered) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,89,55,0.45),_transparent_65%)]" />
        <div className="relative w-full max-w-2xl text-center">
          <div className="relative">
            <img
              src="/assets/poker-iq-splash.jpg"
              alt="Poker IQ — Texas Hold'em Coach"
              className="w-full rounded-2xl border border-slate-700 shadow-2xl shadow-black/60"
            />
            {/* Start sits over the image so it's always visible without scrolling. */}
            <button
              onClick={() => {
                // This tap is a user gesture, so we can request fullscreen here —
                // on Android/Chrome this hides the OS status bar and URL bar for a
                // true edge-to-edge game. (iOS Safari ignores it; use Add to Home
                // Screen there for the same effect.)
                document.documentElement.requestFullscreen?.().catch(() => {});
                setEntered(true);
              }}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-600/45 px-6 py-1.5 text-sm font-semibold text-white shadow-md ring-1 ring-white/40 backdrop-blur-sm transition-colors hover:bg-emerald-500/80"
            >
              ▶ Start
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-400">Practice hands and get plain-English coaching as you play.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Felt-and-card backdrop for a less "blank dashboard" first impression. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,89,55,0.45),_transparent_60%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-700/20 blur-3xl" />

      <div className="relative mx-auto max-w-lg px-4 pt-12 pb-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">
            Poker <span className="text-emerald-400">IQ</span>
          </h1>
          <button onClick={() => setEntered(false)} className="text-sm text-slate-400 hover:text-slate-200">
            ← Splash
          </button>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-6 text-slate-100 shadow-2xl shadow-black/40">
          <div className="mb-6 flex rounded-lg bg-slate-800 p-1">
            <ModeTab label="Quick game" active={mode === 'quick'} onClick={() => setMode('quick')} />
            <ModeTab label="Scenario" active={mode === 'scenario'} onClick={() => setMode('scenario')} />
            <ModeTab label="Training" active={mode === 'train'} onClick={() => setMode('train')} />
          </div>

          {mode === 'train' ? (
            <ChenTrainer />
          ) : mode === 'scenario' ? (
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
