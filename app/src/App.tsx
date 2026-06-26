import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { Table } from './components/Table';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { GameSetup } from './hooks/useGame';
import { clearSession, loadSession, saveSession } from './persistence/storage';

const SETUP_STORAGE_KEY = 'texas-holdem-coach:setup:v1';

function App() {
  const [setup, setSetup] = useState<GameSetup | null>(() => loadSession<GameSetup>(SETUP_STORAGE_KEY));

  const startGame = (newSetup: GameSetup) => {
    saveSession(newSetup, SETUP_STORAGE_KEY);
    setSetup(newSetup);
  };

  const exitToSetup = () => {
    clearSession(SETUP_STORAGE_KEY);
    setSetup(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ErrorBoundary onReset={exitToSetup}>
        {setup ? (
          <Table setup={setup} onExit={exitToSetup} />
        ) : (
          <SetupScreen onStart={startGame} />
        )}
      </ErrorBoundary>
    </div>
  );
}

export default App;
