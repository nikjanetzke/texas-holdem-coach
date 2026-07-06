// Plain-English strategy guides for each scenario: how this spot changes which
// starting hands you should play and why. Written novice-first — every piece of
// poker jargon a guide uses is defined in its own glossary, and hand ranges are
// shown as a colour grid rather than range notation.

export interface GlossaryEntry {
  term: string;
  meaning: string;
}

export interface StrategyPrinciple {
  title: string;
  body: string;
}

export type RangeTier = 'play' | 'maybe';

export interface ScenarioStrategy {
  scenarioId: string;
  /** One-paragraph plain-English read of the situation. */
  intro: string;
  principles: StrategyPrinciple[];
  rangeTitle: string;
  rangeCaption: string;
  /** Hand-notation groups per tier, e.g. "22+", "A2s+", "K9o+", "T9s". */
  range: Record<RangeTier, string[]>;
  glossary: GlossaryEntry[];
}

// ---- Hand-notation expansion -------------------------------------------------
// Turns compact poker range notation into the set of 169 grid hands:
//   "22+"   -> every pair from 22 up to AA
//   "A2s+"  -> A2s, A3s ... AKs (same high card, kicker and up, suited)
//   "K9o+"  -> K9o, KTo, KJo, KQo (offsuit)
//   "T9s"   -> just T9s
const ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const rankIdx = (r: string) => ORDER.indexOf(r);

export function expandRange(groups: string[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    const plus = g.endsWith('+');
    const core = plus ? g.slice(0, -1) : g;
    const hi = core[0];
    const lo = core[1];
    const suffix = core.length > 2 ? core[2] : ''; // 's' | 'o' | '' (pair)
    if (hi === lo) {
      // Pair, optionally "and up".
      const start = rankIdx(hi);
      const end = plus ? ORDER.length - 1 : start;
      for (let i = start; i <= end; i++) out.add(ORDER[i] + ORDER[i]);
    } else {
      // Non-pair: "+" walks the kicker up toward (but below) the high card.
      const start = rankIdx(lo);
      const end = plus ? rankIdx(hi) - 1 : start;
      for (let i = start; i <= end; i++) out.add(hi + ORDER[i] + suffix);
    }
  }
  return out;
}

// Shared glossary entries reused across guides.
const G: Record<string, GlossaryEntry> = {
  bigBlind: { term: 'Big blind (bb)', meaning: 'The forced bet one player posts each hand. Stack sizes are often measured in big blinds — "12bb" means your chips cover 12 big blinds.' },
  headsUp: { term: 'Heads-up', meaning: 'A hand or game with only two players.' },
  jam: { term: 'Jam / shove / all-in', meaning: 'Betting all of your chips at once.' },
  suited: { term: 'Suited / offsuit', meaning: 'Suited (s) = both your cards share a suit, e.g. A♠7♠ — better, because you can make a flush. Offsuit (o) = different suits.' },
  range: { term: 'Range', meaning: 'The set of starting hands you\'d play the same way in a spot. Good players think in ranges ("all pairs, any ace"), not single hands.' },
  position: { term: 'Position', meaning: 'Where you sit relative to the dealer button. Acting after your opponents ("late position") is a big advantage — you see what they do first.' },
  fold: { term: 'Fold equity', meaning: 'The extra value you get from the chance your opponent simply gives up when you bet or raise. It\'s why aggressive plays can win with weak cards.' },
  blindPressure: { term: 'Blind pressure', meaning: 'The blinds come around every hand, constantly eating short stacks. The fewer big blinds you have, the less you can afford to wait for perfect cards.' },
  valueBet: { term: 'Value bet', meaning: 'Betting a strong hand because you want to be called by worse hands — you\'re charging them, not bluffing them.' },
  limp: { term: 'Limp', meaning: 'Just calling the big blind before the flop instead of raising or folding. Usually the weakest option — it wins nothing now and gives away nothing about your hand being strong.' },
  broadway: { term: 'Broadway cards', meaning: 'Ten, Jack, Queen, King and Ace — the cards that make the top straight. "Two broadways" (e.g. K-Q, Q-J) are strong starting hands.' },
  connector: { term: 'Suited connectors', meaning: 'Two touching cards of the same suit, like 8♥7♥. They\'re weak now, but can grow into hidden straights and flushes.' },
  bust: { term: 'Bust / busting', meaning: 'Losing all your chips and being out of the game.' },
  potControl: { term: 'Pot control', meaning: 'Deliberately keeping the pot small with a medium hand so you never have to risk your whole stack with it.' },
};

export const SCENARIO_STRATEGIES: Record<string, ScenarioStrategy> = {
  'short-stack-hu': {
    scenarioId: 'short-stack-hu',
    intro:
      "You have around 12 big blinds against one opponent. That changes everything: you don't have enough chips to see a flop, miss it, and fold — the blinds would eat you alive. Your best weapon is going all-in before the flop. It sounds reckless, but it's the mathematically strongest play: your opponent has to fold everything except good hands, and even when they call, you usually have a real chance to win.",
    principles: [
      {
        title: 'Shove or fold — almost never call',
        body: 'With 12bb, "jamming" (going all-in) or folding are your only good options before the flop. Calling or making small raises leaves you with awkward leftover chips and gives your opponent easy decisions. Jamming makes THEM face the hard decision.',
      },
      {
        title: 'Play far more hands than feels natural',
        body: "Heads-up you only have one opponent to beat, so hand values go way up. A hand like K-9 or A-4, weak at a full table, is a clear all-in here. If it feels too loose, that's normal — most players are far too tight in this spot and get eaten by the blinds.",
      },
      {
        title: 'Fold equity is half your profit',
        body: "Every time you jam and your opponent folds, you win the blinds risk-free. That happens a lot. You don't need the best hand to profit — you need a hand that does okay when called, plus all those free wins when they fold.",
      },
      {
        title: "Don't limp, don't wait",
        body: 'Limping (just calling the blind) wins nothing and burns your stack. Waiting for aces sounds safe, but the blinds will halve your stack before they arrive. Patience is a full-table virtue — heads-up and short, aggression is the virtue.',
      },
    ],
    rangeTitle: 'What to go all-in with (~12bb, heads-up)',
    rangeCaption:
      'Green = jam (all-in). Amber = borderline, jam if your opponent folds a lot. Everything else: fold and take the next hand. Yes, it really is this wide.',
    range: {
      play: ['22+', 'A2s+', 'A2o+', 'K5s+', 'K8o+', 'Q8s+', 'QTo+', 'J8s+', 'JTo', 'T8s+', '98s', '87s'],
      maybe: ['K2s+', 'K5o+', 'Q5s+', 'Q8o+', 'J6s+', 'J9o+', 'T6s+', 'T9o', '97s+', '86s+', '76s', '65s'],
    },
    glossary: [G.bigBlind, G.headsUp, G.jam, G.fold, G.blindPressure, G.limp, G.suited, G.range],
  },

  'big-stack-bully': {
    scenarioId: 'big-stack-bully',
    intro:
      "You have far more chips than everyone else at the table. Your stack is a weapon: every time you raise, your short-stacked opponents risk their tournament life to play back at you, while you risk pocket change. Most of them will fold and wait for premium cards — so take everything they don't defend.",
    principles: [
      {
        title: 'Raise more hands than normal',
        body: "Short stacks can't afford to call and see a flop — they must fold or go all-in. Since they'll only go all-in with strong hands, your raises win the blinds uncontested far more often than usual. That makes raising profitable with hands you'd normally throw away.",
      },
      {
        title: 'Target the medium stacks most',
        body: 'Counter-intuitively, the players with the MOST to lose are the medium stacks — they can still "ladder up" as others bust, so they avoid confrontation. The tiny stacks are already desperate and will gamble. Pressure the ones who can afford to fold.',
      },
      {
        title: "Don't pay off the all-ins",
        body: "When a short stack does shove over your raise, they usually have a real hand. You don't have to call with junk just because you're big — folding costs you a small raise; a bad call doubles them up and shrinks your weapon.",
      },
      {
        title: "Big stack isn't a licence for big pots",
        body: 'Bully with lots of SMALL raises, not huge bets. The goal is many cheap steals, not one giant coin-flip. Avoid building massive pots with medium hands — that\'s how big stacks stop being big stacks.',
      },
    ],
    rangeTitle: 'What to raise with as the big stack',
    rangeCaption:
      'Green = raise (about 2–2.5x the big blind). Amber = raise if the players behind you are folding a lot; otherwise fold. Fold the rest — you don\'t need to play trash to bully.',
    range: {
      play: ['22+', 'A2s+', 'A7o+', 'K9s+', 'KTo+', 'Q9s+', 'QJo', 'J9s+', 'T9s', '98s', '87s', '76s'],
      maybe: ['A2o+', 'K5s+', 'K9o+', 'Q6s+', 'QTo+', 'J7s+', 'JTo', 'T7s+', '97s+', '86s+', '65s', '54s'],
    },
    glossary: [G.bigBlind, G.jam, G.fold, G.bust, G.range, G.suited, G.connector, G.valueBet],
  },

  'medium-6max': {
    scenarioId: 'medium-6max',
    intro:
      'A normal 6-player table with everyone on even, comfortable stacks. This is bread-and-butter poker: no desperation, no bullying — just playing solid starting hands, in position, against opponents with different styles. The chart below is a good default opening range for a 6-player game.',
    principles: [
      {
        title: 'Position decides your range',
        body: 'The later you act, the more hands you can play. First to act (with 5 players still behind you), stick to the green hands. On the button (acting last), you can add most of the amber ones. Acting last means you see everyone\'s decision before making yours — a huge edge.',
      },
      {
        title: 'Raise or fold, rarely call',
        body: "When you're first into a pot, come in with a raise (about 2.5–3x the big blind) or fold. Raising can win immediately, builds a pot when you're strong, and hides your hand. Limping in does none of that.",
      },
      {
        title: 'Notice who you\'re playing against',
        body: 'This table mixes tight players, aggressive players and calling stations (players who call everything). Bluff the tight ones, value-bet the callers relentlessly, and give the aggressive ones rope to hang themselves when you have a real hand.',
      },
      {
        title: 'Medium hands like medium pots',
        body: 'With one pair or a decent-but-not-great hand, keep the pot manageable (pot control). Your monsters want big pots; everything else wants small ones. If the pot is exploding and you hold one medium pair, someone probably has you beat.',
      },
    ],
    rangeTitle: 'Default opening hands, 6-player table',
    rangeCaption:
      'Green = raise from any seat. Amber = add these in late position (button / one off the button) or when the table is folding a lot. Fold the rest.',
    range: {
      play: ['77+', 'ATs+', 'AJo+', 'KJs+', 'KQo', 'QJs', 'JTs', 'T9s'],
      maybe: ['22+', 'A2s+', 'A8o+', 'K9s+', 'KTo+', 'Q9s+', 'QTo+', 'J9s+', 'JTo', '98s', '87s', '76s', '65s'],
    },
    glossary: [G.position, G.range, G.limp, G.valueBet, G.potControl, G.suited, G.broadway, G.connector],
  },

  'card-dead': {
    scenarioId: 'card-dead',
    intro:
      "In this scenario you'll keep being dealt junk — that's the point. Every player goes through stretches like this, and it's where most losing happens: boredom talks you into playing hands you know are bad. The skill being trained here isn't clever play; it's discipline.",
    principles: [
      {
        title: 'Folding is a winning move',
        body: "Every bad hand you fold costs you nothing but patience. Every bad hand you play costs you chips. When you can't win pots, the next best thing is not donating to them — the players who lose the least during cold streaks win the most overall.",
      },
      {
        title: "Don't loosen your standards",
        body: 'After folding twenty hands in a row, 9-5 suited starts to look like aces. It isn\'t. The chart below doesn\'t change because you\'re bored — if a hand was a fold an hour ago, it\'s a fold now.',
      },
      {
        title: 'Steal selectively, not desperately',
        body: 'You can still pick up small pots: when everyone folds to you in late position, a raise with any decent hand often takes the blinds. That\'s targeted aggression from good position — not the same as calling raises with junk because you\'re tired of folding.',
      },
      {
        title: 'Use the downtime',
        body: "Folding doesn't mean switching off. Watch your opponents: who raises constantly, who only plays premiums, who calls everything. When your cards finally arrive, that intel is how you get paid.",
      },
    ],
    rangeTitle: 'Playable hands (they will be rare — that\'s the drill)',
    rangeCaption:
      'Green = still worth raising. Amber = late position only. Most hands you\'re dealt in this scenario belong to neither — fold them and feel good about it.',
    range: {
      play: ['77+', 'ATs+', 'AJo+', 'KJs+', 'KQo', 'QJs', 'JTs'],
      maybe: ['22+', 'A2s+', 'A9o+', 'K9s+', 'KTo+', 'Q9s+', 'QJo', 'J9s+', 'T9s', '98s', '87s'],
    },
    glossary: [G.position, G.range, G.suited, G.blindPressure],
  },

  'running-hot': {
    scenarioId: 'running-hot',
    intro:
      "Here you'll keep being dealt strong hands. Sounds easy — but big hands lose the most money when misplayed, and win far less than they should when played timidly. The skill being trained: extracting maximum value without scaring everyone away.",
    principles: [
      {
        title: 'Strong hands want big pots — built gradually',
        body: 'With a premium hand, your job is to get chips in, but a giant bet just makes everyone fold. Bet solid, confident amounts (half to three-quarters of the pot) on every round instead. Three medium bets win far more than one scary one.',
      },
      {
        title: 'Value bet thinner than feels comfortable',
        body: "Against players who love to call, bet your good-but-not-perfect hands too — top pair, two pair. Don't check just because someone MIGHT have better. If worse hands can call you, betting makes money; that's the whole idea of a value bet.",
      },
      {
        title: 'Fast-play your monsters on dangerous boards',
        body: "With a big hand on a board full of possible straights and flushes, don't get cute and slow-play — charge the draws now. Trapping only works on boards where nothing can outdraw you.",
      },
      {
        title: 'A great starting hand is not a marriage',
        body: 'Even running hot, A-K that misses the flop is just ace-high, and aces are one pair. When the board turns ugly and a passive player suddenly raises big, strong STARTING cards are allowed to fold. Read the board you\'re on, not the cards you were dealt.',
      },
    ],
    rangeTitle: 'Premium hands and how hard to play them',
    rangeCaption:
      'Green = raise, and re-raise if someone raises first — build the pot now. Amber = raise, but slow down if the action gets heavy. (In this scenario you\'ll mostly be dealt these!)',
    range: {
      play: ['TT+', 'AQs+', 'AKo'],
      maybe: ['77+', 'ATs+', 'AJo+', 'KJs+', 'KQo', 'QJs'],
    },
    glossary: [G.valueBet, G.range, G.potControl, G.suited, G.broadway],
  },
};
