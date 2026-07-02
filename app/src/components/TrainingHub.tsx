import { useState } from 'react';
import { ChenTrainer } from './ChenTrainer';
import { OutsTrainer } from './OutsTrainer';
import { PotOddsTrainer } from './PotOddsTrainer';

// Groups the practice drills under sub-tabs inside the Training tab.
export function TrainingHub() {
  const [drill, setDrill] = useState<'chen' | 'outs' | 'potodds'>('chen');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-950/60 p-1 ring-1 ring-slate-700/50">
        <SubTab label="Starting hands" active={drill === 'chen'} onClick={() => setDrill('chen')} />
        <SubTab label="Draws & outs" active={drill === 'outs'} onClick={() => setDrill('outs')} />
        <SubTab label="Fold, call or raise?" active={drill === 'potodds'} onClick={() => setDrill('potodds')} />
      </div>
      {drill === 'chen' ? <ChenTrainer /> : drill === 'outs' ? <OutsTrainer /> : <PotOddsTrainer />}
    </div>
  );
}

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
