import type { MistakeKind } from '../training/mistakes';
import { loadSession, saveSession } from './storage';

// Your progress across sessions: one summary per sitting at the table, kept
// up to date after every hand (so closing the tab loses nothing).

export interface SessionSummary {
  /** When the session started (ms) — also its id. */
  id: number;
  /** When it was last updated (ms). */
  updatedAt: number;
  hands: number;
  /** Hands won (missing on sessions saved before it was recorded). */
  handsWon?: number;
  /** Decisions the coach scored, and their average (null = none yet). */
  decisions: number;
  avgScore: number | null;
  netChips: number;
  vpipPercent: number | null;
  mistakes: Record<MistakeKind, number>;
  smallValueBets: number;
}

const KEY = 'texas-holdem-coach:progress:v1';
export const MAX_SESSIONS = 30;

export function loadProgress(): SessionSummary[] {
  const data = loadSession<SessionSummary[]>(KEY);
  return Array.isArray(data) ? data : [];
}

/** Add or update a session (matched by id), keeping the most recent MAX_SESSIONS, oldest first. */
export function recordSession(summary: SessionSummary): void {
  if (summary.hands === 0) return;
  const rest = loadProgress().filter((s) => s.id !== summary.id);
  const all = [...rest, summary].sort((a, b) => a.id - b.id).slice(-MAX_SESSIONS);
  saveSession(all, KEY);
}

export const LEAK_LABELS: Record<MistakeKind | 'sizing', string> = {
  overcall: 'Calling without the odds',
  overfold: 'Folding hands worth playing',
  freefold: 'Folding when you could check',
  sizing: 'Betting too small with strong hands',
};

/** Your most frequent leaks over the last `n` sessions, biggest first. */
export function recentLeaks(sessions: SessionSummary[], n = 5): { id: keyof typeof LEAK_LABELS; label: string; count: number }[] {
  const recent = sessions.slice(-n);
  const totals: Record<keyof typeof LEAK_LABELS, number> = { overcall: 0, overfold: 0, freefold: 0, sizing: 0 };
  for (const s of recent) {
    for (const k of Object.keys(s.mistakes) as MistakeKind[]) totals[k] += s.mistakes[k] ?? 0;
    totals.sizing += s.smallValueBets ?? 0;
  }
  return (Object.keys(totals) as (keyof typeof LEAK_LABELS)[])
    .filter((k) => totals[k] > 0)
    .map((k) => ({ id: k, label: LEAK_LABELS[k], count: totals[k] }))
    .sort((a, b) => b.count - a.count);
}

/**
 * This session's average decision score against your recent sessions before
 * it (weighted by decisions). null when there's nothing to compare.
 */
export function compareToRecent(sessions: SessionSummary[], current: { id: number; avgScore: number | null }, n = 5) {
  if (current.avgScore == null) return null;
  const before = sessions.filter((s) => s.id < current.id && s.avgScore != null && s.decisions > 0).slice(-n);
  const decisions = before.reduce((a, s) => a + s.decisions, 0);
  if (decisions === 0) return null;
  const avg = before.reduce((a, s) => a + (s.avgScore as number) * s.decisions, 0) / decisions;
  return { previousAvg: Math.round(avg * 10) / 10, sessions: before.length, delta: Math.round((current.avgScore - avg) * 10) / 10 };
}

export interface ProgressTotals {
  sessions: number;
  hands: number;
  handsWon: number | null;
  decisions: number;
  avgScore: number | null;
  netChips: number;
  vpipPercent: number | null;
}

/** Everything added up across saved sessions (scores and VPIP weighted by how much each session had). */
export function progressTotals(sessions: SessionSummary[]): ProgressTotals {
  const hands = sessions.reduce((a, s) => a + s.hands, 0);
  const decisions = sessions.reduce((a, s) => a + s.decisions, 0);
  const scored = sessions.filter((s) => s.avgScore != null && s.decisions > 0);
  const withVpip = sessions.filter((s) => s.vpipPercent != null && s.hands > 0);
  const vpipHands = withVpip.reduce((a, s) => a + s.hands, 0);
  const withWins = sessions.filter((s) => s.handsWon != null);
  return {
    sessions: sessions.length,
    hands,
    handsWon: withWins.length ? withWins.reduce((a, s) => a + (s.handsWon ?? 0), 0) : null,
    decisions,
    avgScore: decisions ? Math.round((scored.reduce((a, s) => a + (s.avgScore as number) * s.decisions, 0) / decisions) * 10) / 10 : null,
    netChips: sessions.reduce((a, s) => a + s.netChips, 0),
    vpipPercent: vpipHands ? Math.round(withVpip.reduce((a, s) => a + (s.vpipPercent as number) * s.hands, 0) / vpipHands) : null,
  };
}
