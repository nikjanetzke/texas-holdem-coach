import type { HandPlayer } from '../engine/game';
import { CardView } from './CardView';

export function Seat({
  player,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isActing,
  isWinner,
  showCards,
  handLabel,
}: {
  player: HandPlayer;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  isWinner: boolean;
  showCards: boolean;
  handLabel?: string;
}) {
  return (
    <div
      className={`relative w-32 rounded-xl border px-2 py-1.5 backdrop-blur-sm transition-all duration-200 ${
        isWinner
          ? 'animate-winner border-amber-400 bg-slate-900/90'
          : isActing
            ? 'ring-acting border-amber-400/70 bg-slate-900/90'
            : 'border-slate-700 bg-slate-900/75'
      } ${player.folded ? 'opacity-45' : ''}`}
    >
      <div className="absolute -top-2 -right-2 flex gap-1">
        {isDealer && <Badge text="D" className="bg-white text-slate-900" />}
        {isSmallBlind && <Badge text="SB" className="bg-sky-500 text-white" />}
        {isBigBlind && <Badge text="BB" className="bg-rose-500 text-white" />}
      </div>

      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-semibold text-slate-100 truncate max-w-[70px]">{player.name}</span>
        <span className="font-mono text-emerald-300">{player.stack}</span>
      </div>

      <div className="flex justify-center gap-1">
        {player.holeCards.length === 0 ? (
          <>
            <CardView hidden size="sm" />
            <CardView hidden size="sm" />
          </>
        ) : (
          player.holeCards.map((c, i) => (
            <CardView key={i} card={showCards ? c : undefined} hidden={!showCards} size="sm" animate={showCards} />
          ))
        )}
      </div>

      {player.folded && (
        <div className="mt-1 text-center text-[10px] uppercase tracking-wide text-slate-500">Folded</div>
      )}
      {!player.folded && handLabel && (
        <div className="mt-1 text-center text-[10px] font-semibold text-amber-300">{handLabel}</div>
      )}
    </div>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow ${className}`}>
      {text}
    </span>
  );
}
