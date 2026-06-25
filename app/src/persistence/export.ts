import type { Card } from '../engine/deck';
import { HAND_RANK_NAMES } from '../engine/evaluator';
import type { GameSetup, HandRecord } from '../hooks/useGame';
import type { LeakTracker } from '../coach/coach';

const EXPORT_VERSION = 1;

function cardStr(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export interface SessionExport {
  version: number;
  exportedAt: string;
  blinds: { smallBlind: number; bigBlind: number };
  startingStack: number;
  players: { id: string; name: string; isHuman: boolean }[];
  leaks: { leak: string; count: number; percentOfHands: number }[];
  hands: HandRecord[];
}

export function buildSessionExport(
  setup: GameSetup,
  handHistory: HandRecord[],
  leakTracker: LeakTracker,
): SessionExport {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    blinds: { smallBlind: setup.smallBlind, bigBlind: setup.bigBlind },
    startingStack: setup.startingStack,
    players: setup.seats.map((s) => ({ id: s.id, name: s.name, isHuman: s.isHuman })),
    leaks: leakTracker.topLeaks(10),
    // History is newest-first; export oldest-first so a reviewer reads chronologically.
    hands: [...handHistory].reverse(),
  };
}

export function exportToJSON(data: SessionExport): string {
  return JSON.stringify(data, null, 2);
}

// A plain-English transcript suited to pasting into an AI for review.
export function exportToText(data: SessionExport): string {
  const lines: string[] = [];
  const nameById = Object.fromEntries(data.players.map((p) => [p.id, p.name]));

  lines.push(`Texas Hold'em session review`);
  lines.push(`Exported: ${data.exportedAt}`);
  lines.push(`Blinds: ${data.blinds.smallBlind}/${data.blinds.bigBlind} · Starting stack: ${data.startingStack}`);
  lines.push(`Players: ${data.players.map((p) => `${p.name}${p.isHuman ? ' (you)' : ''}`).join(', ')}`);
  lines.push('');

  for (const hand of data.hands) {
    lines.push(`=== Hand #${hand.handNumber} (dealer: ${nameById[data.players[hand.dealerSeat]?.id] ?? '?'}) ===`);
    lines.push(`Board: ${hand.communityCards.map(cardStr).join(' ') || '(none)'}`);
    for (const p of hand.players) {
      lines.push(`  ${p.name}: ${p.holeCards.map(cardStr).join(' ')}`);
    }

    lines.push('  Actions:');
    let lastStreet = '';
    for (const a of hand.actionLog) {
      if (a.street !== lastStreet) {
        lastStreet = a.street;
        lines.push(`    -- ${a.street} --`);
      }
      const amt = a.amount ? ` ${a.amount}` : '';
      lines.push(`    ${nameById[a.playerId] ?? a.playerId} ${a.type}${amt}`);
    }

    if (hand.showdownResult) {
      const payouts = Object.entries(hand.showdownResult.payouts)
        .map(([id, amount]) => `${nameById[id] ?? id} +${amount}`)
        .join(', ');
      lines.push(`  Result: ${payouts}`);
      const best = hand.showdownResult.bestHandByPlayer;
      for (const id of Object.keys(best)) {
        lines.push(`    ${nameById[id] ?? id} showed ${HAND_RANK_NAMES[best[id].rank]}`);
      }
    }

    if (hand.decisionTimings.length > 0) {
      lines.push('  Your decisions (think time):');
      for (const t of hand.decisionTimings) {
        const eq = t.equityPercent != null ? `, equity ${t.equityPercent.toFixed(0)}%` : '';
        const po = t.potOddsPercent != null ? `, pot odds ${t.potOddsPercent.toFixed(0)}%` : '';
        lines.push(`    ${t.street}: ${t.action} in ${(t.thinkMs / 1000).toFixed(1)}s${eq}${po}`);
      }
    }
    lines.push('');
  }

  if (data.leaks.length > 0) {
    lines.push('=== Recurring leaks ===');
    for (const l of data.leaks) {
      lines.push(`  ${l.leak}: ${l.count} (${l.percentOfHands.toFixed(0)}% of decisions)`);
    }
  }

  return lines.join('\n');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
