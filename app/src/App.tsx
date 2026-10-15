import { lazy, Suspense, useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
// The table (with the Pixi.js graphics engine, most of the app's size) loads
// only when a game starts, so the menu and training open quickly on phones.
const Table = lazy(() => import('./components/Table').then((m) => ({ default: m.Table })));
import { ErrorBoundary } from './components/ErrorBoundary';
import type { GameSetup } from './hooks/useGame';
import type { DrillId } from './persistence/drillStats';
import { clearSession, loadSession, saveSession } from './persistence/storage';

const SETUP_STORAGE_KEY = 'texas-holdem-coach:setup:v1';

function App() {
  const [setup, setSetup] = useState<GameSetup | null>(() => loadSession<GameSetup>(SETUP_STORAGE_KEY));
  // Set when leaving the table via a "Practise this" button in the session
  // report, so the menu opens straight onto that drill.
  const [openDrill, setOpenDrill] = useState<DrillId | undefined>(undefined);

  const startGame = (newSetup: GameSetup) => {
    setOpenDrill(undefined);
    saveSession(newSetup, SETUP_STORAGE_KEY);
    setSetup(newSetup);
  };

  const exitToSetup = (drill?: DrillId) => {
    setOpenDrill(drill);
    clearSession(SETUP_STORAGE_KEY);
    // Also clear the in-game progress session (stacks, hand number, dealer seat).
    // Without this, starting the same scenario again (its AI seat ids are
    // deterministic, e.g. "ai-1") reused the previous game's leftover session —
    // including a busted 0 stack — so the new game silently restored a dead
    // table and instantly showed the win/game-over screen with no hands played.
    clearSession();
    setSetup(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ErrorBoundary onReset={() => exitToSetup()}>
        {setup ? (
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Shuffling up…</div>}>
            <Table setup={setup} onExit={exitToSetup} />
          </Suspense>
        ) : (
          <SetupScreen key={openDrill ?? 'menu'} onStart={startGame} openDrill={openDrill} />
        )}
      </ErrorBoundary>
    </div>
  );
}

export default App;
