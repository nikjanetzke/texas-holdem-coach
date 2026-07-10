import { useState } from 'react';
import type { GameSetup } from '../hooks/useGame';
import { buildDefaultSeats } from '../hooks/useGame';
import { BLIND_SCHEDULES, DEFAULT_SCHEDULE_ID } from '../engine/blinds';
import { SCENARIOS } from '../scenarios/scenarios';
import type { Scenario } from '../scenarios/scenarios';
import { SCENARIO_STRATEGIES } from '../scenarios/strategy';
import { StrategyGuide } from './StrategyGuide';
import { TrainingHub } from './TrainingHub';

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState<'quick' | 'scenario' | 'train'>('quick');
  // Kept as strings so the fields can be cleared while typing (a numeric state
  // floored at the min would otherwise pin them at "0" and refuse to empty).
  const [numPlayers, setNumPlayers] = useState('6');
  const [startingStack, setStartingStack] = useState('10000');
  const [scheduleId, setScheduleId] = useState(DEFAULT_SCHEDULE_ID);
  const [actionTimerSeconds, setActionTimerSeconds] = useState<number | null>(null);
  // Table preferences — defaults per request: coach off, speech off, auto-advance on.
  const [coachDefault, setCoachDefault] = useState(false);
  const [speechDefault, setSpeechDefault] = useState(false);
  const [autoAdvanceDefault, setAutoAdvanceDefault] = useState(true);
  // A picked scenario shows its strategy primer first; confirming starts the game.
  const [pendingScenario, setPendingScenario] = useState<Scenario | null>(null);

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
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      {/* Layered casino backdrop: green felt glow up top, warm gold glow below. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,_rgba(16,120,72,0.5),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,_rgba(212,175,55,0.12),_transparent_55%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-600/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[760px] -translate-x-1/2 rounded-full bg-amber-500/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-lg px-4 pt-10 pb-12">
        <div className="mb-6 flex items-end justify-between">
          <h1 className="text-3xl font-black tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">Poker</span>
            <span className="ml-1.5 bg-gradient-to-b from-emerald-300 to-emerald-500 bg-clip-text text-transparent">IQ</span>
          </h1>
          <button
            onClick={() => setEntered(false)}
            className="rounded-full px-3 py-1 text-sm text-slate-400 ring-1 ring-slate-700/60 transition-colors hover:bg-slate-800/60 hover:text-slate-100"
          >
            ← Splash
          </button>
        </div>

        {/* Premium glass panel with a gold top edge. */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 text-slate-100 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/5">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
          <div className="mb-6 flex gap-1 rounded-xl bg-slate-950/60 p-1 ring-1 ring-slate-700/50">
            <ModeTab label="Quick game" active={mode === 'quick'} onClick={() => setMode('quick')} />
            <ModeTab label="Scenario" active={mode === 'scenario'} onClick={() => setMode('scenario')} />
            <ModeTab label="Training" active={mode === 'train'} onClick={() => setMode('train')} />
          </div>

          {mode === 'train' ? (
            <TrainingHub />
          ) : mode === 'scenario' ? (
            <div className="space-y-2.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => (SCENARIO_STRATEGIES[s.id] ? setPendingScenario(s) : onStart(s.build()))}
                  className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-800/50 px-4 py-3 text-left transition-all hover:border-emerald-500/70 hover:bg-slate-800"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="flex-1">
                    <span className="block font-semibold text-slate-100">{s.name}</span>
                    <span className="block text-xs text-slate-400">{s.description}</span>
                  </span>
                  <span className="text-slate-600 transition-colors group-hover:text-emerald-400">→</span>
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
              coachDefault={coachDefault}
              setCoachDefault={setCoachDefault}
              speechDefault={speechDefault}
              setSpeechDefault={setSpeechDefault}
              autoAdvanceDefault={autoAdvanceDefault}
              setAutoAdvanceDefault={setAutoAdvanceDefault}
              onStart={onStart}
            />
          )}
        </div>
      </div>

      {/* Strategy primer shown before a scenario starts — teaches how this
          specific spot changes which hands to play, in novice-friendly terms. */}
      {pendingScenario && SCENARIO_STRATEGIES[pendingScenario.id] && (
        <StrategyGuide
          strategy={SCENARIO_STRATEGIES[pendingScenario.id]}
          closeLabel="♠ Got it — deal me in"
          onClose={() => setPendingScenario(null)}
          onConfirm={() => {
            const scenario = pendingScenario;
            setPendingScenario(null);
            onStart(scenario.build());
          }}
        />
      )}
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

function OptionToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        <span className="block text-xs text-slate-400">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-slate-600'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
        active
          ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/40'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
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
  coachDefault,
  setCoachDefault,
  speechDefault,
  setSpeechDefault,
  autoAdvanceDefault,
  setAutoAdvanceDefault,
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
  coachDefault: boolean;
  setCoachDefault: (v: boolean) => void;
  speechDefault: boolean;
  setSpeechDefault: (v: boolean) => void;
  autoAdvanceDefault: boolean;
  setAutoAdvanceDefault: (v: boolean) => void;
  onStart: (setup: GameSetup) => void;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Players (2-10)</span>
          <input
            type="number"
            min={2}
            max={10}
            value={numPlayers}
            onChange={(e) => setNumPlayers(e.target.value)}
            onBlur={(e) => setNumPlayers(String(clampInt(e.target.value, 2, 10, 6)))}
            className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 font-mono outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Starting chips</span>
          <input
            type="number"
            min={100}
            step={100}
            value={startingStack}
            onChange={(e) => setStartingStack(e.target.value)}
            onBlur={(e) => setStartingStack(String(clampInt(e.target.value, 100, 1_000_000, 1000)))}
            className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 font-mono outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
        </label>
      </div>

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
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                actionTimerSeconds != null ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </span>
      </label>

      <div className="mb-6 space-y-2">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">Table options</span>
        <OptionToggle
          label="Coaching"
          hint="In-game advice, hints and decision scoring."
          checked={coachDefault}
          onChange={setCoachDefault}
        />
        <OptionToggle
          label="Voice"
          hint="Read your turn (and coaching, when on) aloud."
          checked={speechDefault}
          onChange={setSpeechDefault}
        />
        <OptionToggle
          label="Auto next hand"
          hint="Deal the next hand automatically after each result."
          checked={autoAdvanceDefault}
          onChange={setAutoAdvanceDefault}
        />
      </div>

      <button
        className="w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-3 text-base font-bold text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/40 transition-all hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.99]"
        onClick={() =>
          onStart({
            seats: buildDefaultSeats(clampInt(numPlayers, 2, 10, 6)),
            startingStack: clampInt(startingStack, 100, 1_000_000, 1000),
            scheduleId,
            actionTimerSeconds: actionTimerSeconds ?? undefined,
            coachDefault,
            speechDefault,
            autoAdvanceDefault,
          })
        }
      >
        ♠ Start playing
      </button>
    </>
  );
}
