import type { ActionLogEntry } from '../engine/game';
import type { AIProfile } from '../ai/profiles';

// Opponent notes: what each opponent tends to do and how to play against it —
// the notes real players keep on the regulars at their table.
//
// The read itself comes from the opponent's actual playing style (the profile
// that drives their decisions). It is NOT inferred from the hands you've seen:
// simulated games showed that over the ~20 hands a session keeps, observed
// stats are mostly noise (the same opponent read as "calls a lot" in one
// stretch and "tight" in the next), which would teach wrong conclusions. Over
// hundreds of hands the styles do show (e.g. Leo folded to 16% of bets vs The
// Professor's 34%; Spike made ~2 bets/raises per call vs Leo's 0.6). So the
// note unlocks once you've watched someone for a few hands, and shows what
// you've actually seen as supporting evidence. Pure, so it can be unit tested.

/** The parts of a recorded hand this needs (a HandRecord fits). */
export interface ObservedHand {
  players: { id: string }[];
  actionLog: ActionLogEntry[];
}

export interface OpponentStats {
  /** Hands they were dealt into. */
  hands: number;
  /** Hands where they chose to put money in before the flop (not just a forced blind). */
  played: number;
  /** Bets and raises they chose to make, all rounds. */
  aggressive: number;
  /** Calls they made, all rounds. */
  calls: number;
  /** Times they faced a bet after the flop... */
  facedBet: number;
  /** ...and folded to it. */
  foldedToBet: number;
}

const AGGRESSIVE = new Set(['bet', 'raise', 'all-in']);

export function opponentStats(history: ObservedHand[], playerId: string): OpponentStats {
  const s: OpponentStats = { hands: 0, played: 0, aggressive: 0, calls: 0, facedBet: 0, foldedToBet: 0 };
  for (const hand of history) {
    // Only hands they were actually dealt into (they posted a blind or acted).
    if (!hand.actionLog.some((e) => e.playerId === playerId)) continue;
    s.hands++;
    let played = false;
    // Replay the betting to know when they were facing a bet.
    let street = '';
    let streetMax = 0;
    let inFront: Record<string, number> = {};
    for (const e of hand.actionLog) {
      if (e.street !== street) {
        street = e.street;
        streetMax = 0;
        inFront = {};
      }
      const before = inFront[e.playerId] ?? 0;
      if (e.playerId === playerId && !e.forced) {
        if (e.street === 'preflop' && (e.type === 'call' || AGGRESSIVE.has(e.type))) played = true;
        if (AGGRESSIVE.has(e.type)) s.aggressive++;
        if (e.type === 'call') s.calls++;
        if (e.street !== 'preflop' && streetMax > before) {
          s.facedBet++;
          if (e.type === 'fold') s.foldedToBet++;
        }
      }
      if (e.amount && e.type !== 'fold' && e.type !== 'check') {
        inFront[e.playerId] = before + e.amount;
        streetMax = Math.max(streetMax, inFront[e.playerId]);
      }
    }
    if (played) s.played++;
  }
  return s;
}

export type NoteId = 'station' | 'bluffer' | 'aggressive' | 'tight' | 'passive' | 'loose';

export interface OpponentNote {
  id: NoteId;
  /** Name of the style, e.g. "Calls a lot". */
  tag: string;
  /** Even shorter, to fit on the seat ("Loose" for "Plays lots of hands"). */
  seatTag: string;
  /** What they do, in plain English. */
  what: string;
  /** How to play against it. */
  adjust: string;
  tone: 'red' | 'amber' | 'green' | 'blue';
}

export interface OpponentRead {
  /** Watched long enough to share the read. */
  ready: boolean;
  handsSeen: number;
  handsNeeded: number;
  /** Most useful first (the first is the seat tag). Empty = a balanced, ordinary style. */
  notes: OpponentNote[];
  /** What you've seen them do this session — the evidence. */
  stats: OpponentStats;
}

export const HANDS_FOR_A_READ = 5;

type Style = Pick<AIProfile, 'tightness' | 'aggression' | 'bluffFrequency' | 'callingFrequency'>;

// In priority order: how they react to YOUR bets decides whether bluffing
// works, so that comes first, then how they bet, then which hands they play.
const RULES: { test: (p: Style) => boolean; note: OpponentNote }[] = [
  {
    test: (p) => p.callingFrequency >= 0.75,
    note: {
      id: 'station',
      tag: 'Calls a lot',
      seatTag: 'Calls a lot',
      what: 'Hates folding: calls bets with weak hands and draws, hoping to catch up. Poker players call this a "calling station".',
      adjust: "Don't bluff them — they'll call. When you have a good hand, bet it (even bet bigger): they'll pay you off with worse.",
      tone: 'amber',
    },
  },
  {
    test: (p) => p.aggression >= 0.75 && p.bluffFrequency >= 0.3,
    note: {
      id: 'bluffer',
      tag: 'Bluffs a lot',
      seatTag: 'Bluffs a lot',
      what: 'Bets and raises all the time, and plenty of those bets are bluffs (betting with a weak hand to make you fold).',
      adjust: "Don't fold a decent hand just because they bet. When you're strong, check and let them bet into you.",
      tone: 'red',
    },
  },
  {
    test: (p) => p.aggression >= 0.7 && p.bluffFrequency < 0.3,
    note: {
      id: 'aggressive',
      tag: 'Aggressive',
      seatTag: 'Aggressive',
      what: 'Bets and raises a lot — but mostly with real hands, not bluffs.',
      adjust: "Respect their big raises. Don't let small bets push you off a good hand, though.",
      tone: 'red',
    },
  },
  {
    test: (p) => p.tightness >= 0.75,
    note: {
      id: 'tight',
      tag: 'Tight',
      seatTag: 'Tight',
      what: 'Only plays strong starting hands and folds the rest.',
      adjust: 'When they bet or raise, believe them and fold your medium hands. They fold a lot before the flop, so raise to steal their blinds.',
      tone: 'blue',
    },
  },
  {
    test: (p) => p.aggression <= 0.3,
    note: {
      id: 'passive',
      tag: 'Passive',
      seatTag: 'Passive',
      what: 'Mostly checks and calls; rarely bets or raises.',
      adjust: 'If they suddenly bet big or raise, they almost always have a strong hand — fold your medium ones.',
      tone: 'blue',
    },
  },
  {
    test: (p) => p.tightness <= 0.25,
    note: {
      id: 'loose',
      tag: 'Plays lots of hands',
      seatTag: 'Loose',
      what: 'Plays many weak starting hands that most players would fold.',
      adjust: "You'll be ahead of them more often than usual — play your good hands for value against them.",
      tone: 'amber',
    },
  },
];

export function readOpponent(style: Style, history: ObservedHand[], playerId: string): OpponentRead {
  const stats = opponentStats(history, playerId);
  const ready = stats.hands >= HANDS_FOR_A_READ;
  return {
    ready,
    handsSeen: stats.hands,
    handsNeeded: HANDS_FOR_A_READ,
    notes: ready ? RULES.filter((r) => r.test(style)).map((r) => r.note).slice(0, 3) : [],
    stats,
  };
}

/** "Seen so far" evidence lines, in plain English. */
export function evidenceLines(s: OpponentStats): string[] {
  const lines = [`Played ${s.played} of the ${s.hands} hands you've watched (put money in before the flop by choice).`];
  if (s.aggressive + s.calls > 0) lines.push(`Made ${s.aggressive} bet${s.aggressive === 1 ? '' : 's'} or raise${s.aggressive === 1 ? '' : 's'} and ${s.calls} call${s.calls === 1 ? '' : 's'}.`);
  if (s.facedBet > 0) lines.push(`Folded to ${s.foldedToBet} of ${s.facedBet} bet${s.facedBet === 1 ? '' : 's'} after the flop.`);
  return lines;
}
