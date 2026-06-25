import { useState } from 'react';
import type { GameSetup, HandRecord } from '../hooks/useGame';
import type { LeakTracker } from '../coach/coach';
import { buildSessionExport, downloadFile, exportToJSON, exportToText } from '../persistence/export';

export function ExportControls({
  setup,
  handHistory,
  leakTracker,
  blinds,
}: {
  setup: GameSetup;
  handHistory: HandRecord[];
  leakTracker: LeakTracker;
  blinds: { smallBlind: number; bigBlind: number };
}) {
  const [copied, setCopied] = useState<'json' | 'text' | null>(null);

  if (handHistory.length === 0) return null;

  const build = () => buildSessionExport(setup, handHistory, leakTracker, blinds);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  const copy = async (kind: 'json' | 'text') => {
    const data = build();
    const content = kind === 'json' ? exportToJSON(data) : exportToText(data);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be blocked (e.g. non-secure context) — fall back to a download.
      downloadFile(`holdem-session-${stamp}.${kind === 'json' ? 'json' : 'txt'}`, content, 'text/plain');
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
      <div className="mb-2 font-semibold text-slate-300">Export for review</div>
      <p className="mb-2 text-slate-500">
        Save or copy this session — paste the text version into an AI and ask it to review your play.
      </p>
      <div className="flex flex-wrap gap-2">
        <ExportButton label={copied === 'text' ? 'Copied!' : 'Copy summary'} onClick={() => copy('text')} />
        <ExportButton label={copied === 'json' ? 'Copied!' : 'Copy JSON'} onClick={() => copy('json')} />
        <ExportButton
          label="Download .txt"
          onClick={() => downloadFile(`holdem-session-${stamp}.txt`, exportToText(build()), 'text/plain')}
        />
        <ExportButton
          label="Download .json"
          onClick={() => downloadFile(`holdem-session-${stamp}.json`, exportToJSON(build()), 'application/json')}
        />
      </div>
    </div>
  );
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded bg-slate-700 px-3 py-1 font-medium text-slate-200 hover:bg-slate-600">
      {label}
    </button>
  );
}
