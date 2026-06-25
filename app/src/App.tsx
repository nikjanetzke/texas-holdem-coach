import { useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { Table } from './components/Table';
import type { GameSetup } from './hooks/useGame';

function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {setup ? (
        <Table setup={setup} onExit={() => setSetup(null)} />
      ) : (
        <SetupScreen onStart={setSetup} />
      )}
    </div>
  );
}

export default App;
