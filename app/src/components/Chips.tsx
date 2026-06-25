export function Chips({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return (
    <div className="animate-chip flex items-center gap-1 rounded-full bg-slate-950/80 border border-amber-400/60 px-2 py-0.5 text-[11px] font-semibold text-amber-200 shadow">
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-200/50" />
      {amount}
    </div>
  );
}
