import type { BotSpeed } from '../hooks/useGame';
const SPEED_OPTIONS: { id: BotSpeed; label: string }[] = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
];

export function SpeedPicker({ value, onChange }: { value: BotSpeed; onChange: (s: BotSpeed) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-950/60 p-1 ring-1 ring-slate-700/50" role="radiogroup" aria-label="Game speed">
      {SPEED_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === o.id ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
