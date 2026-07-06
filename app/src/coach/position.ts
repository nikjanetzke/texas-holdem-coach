import type { HandEngine } from '../engine/game';

// Beginner-first position info for the human's seat this hand. The design rule:
// consequence first ("how many people act after you?"), colour second (red =
// careful, green = advantage), poker names last — so the jargon arrives attached
// to something already understood. Everything rendered from this is part of the
// coaching UI and must be hidden when the coach is toggled off.

export type PositionKey = 'early' | 'middle' | 'late' | 'button' | 'sb' | 'bb' | 'headsup-btn';

export interface PositionInfo {
  key: PositionKey;
  /** The poker name, taught last: "Under the gun", "The button"... */
  pokerName: string;
  /** The plain-English badge text, taught first: "First to act (Early)". */
  plain: string;
  /** red = play tight, amber = normal, green = advantage, blue = blinds. */
  tone: 'red' | 'amber' | 'green' | 'blue';
  /** How many opponents still act after you before the flop. */
  playersAfter: number;
  /** One-line tip shown in the badge tooltip / coach panel. */
  tip: string;
  /** Tap-to-open explainer paragraphs, novice language. */
  explainer: string[];
}

// Rebuilds the preflop seating order (first-to-act ... button, then blinds)
// from the engine's fixed hand state, so the human's position stays stable for
// the whole hand even though the engine's acting order changes each street.
export function describeHumanPosition(engine: HandEngine): PositionInfo | null {
  const players = engine.players;
  const human = players.find((p) => p.id === 'human');
  if (!human || human.sittingOut) return null;

  const activeCount = players.filter((p) => !p.sittingOut).length;
  if (activeCount < 2) return null;

  const isSB = engine.smallBlindId === 'human';
  const isBB = engine.bigBlindId === 'human';
  const isButton = players[engine.dealerSeat]?.id === 'human';

  // Heads-up is special: the button IS the small blind and acts first preflop
  // but last on every later street.
  if (activeCount === 2) {
    if (isButton || isSB) {
      return {
        key: 'headsup-btn',
        pokerName: 'Button + small blind (heads-up)',
        plain: 'Button — best seat',
        tone: 'green',
        playersAfter: 1,
        tip: 'After the flop you act last every round — a big edge. Play lots of hands.',
        explainer: [
          'Heads-up (two players), the dealer button posts the small blind and acts first before the flop — but acts LAST on every round after it.',
          'Acting last means you see what your opponent does before you decide. That information edge is why the button plays far more hands than usual.',
        ],
      };
    }
    return {
      key: 'bb',
      pokerName: 'Big blind (heads-up)',
      plain: 'Big blind — already paid in',
      tone: 'blue',
      playersAfter: 1,
      tip: 'You already have chips in — you can see flops cheaply, but you act first after the flop.',
      explainer: [
        "You posted the big blind, so you've already paid for part of this hand — closing the action is cheaper for you.",
        'The catch: after the flop you act FIRST every round, with no information about what your opponent will do. Be more careful with medium hands.',
      ],
    };
  }

  if (isSB || isBB) {
    return {
      key: isSB ? 'sb' : 'bb',
      pokerName: isSB ? 'Small blind' : 'Big blind',
      plain: `${isSB ? 'Small' : 'Big'} blind — already paid in`,
      tone: 'blue',
      playersAfter: isSB ? 1 : 0,
      tip: 'You already have chips in, but after the flop you act first — the worst spot to be.',
      explainer: [
        `You posted the ${isSB ? 'small' : 'big'} blind — a forced bet — so part of your money is already in the pot this hand.`,
        'That discount tempts people into playing too many hands from the blinds. The problem: on every round after the flop, the blinds act FIRST, with everyone else watching before they commit. Winning players actually play their TIGHTEST from here.',
      ],
    };
  }

  if (isButton) {
    return {
      key: 'button',
      pokerName: 'The button (dealer)',
      plain: 'Button — best seat',
      tone: 'green',
      playersAfter: 2,
      tip: 'Only the blinds act after you now, and after the flop you act last. Play more hands.',
      explainer: [
        'The dealer button is the best seat in poker: after the flop, you act LAST on every round.',
        "Acting last is like bidding last in an auction — you've seen everyone's move before committing a chip. That's why hands too weak to play from other seats become profitable raises here.",
      ],
    };
  }

  // Everyone else: order the non-blind seats from first-to-act to the button
  // and classify by how many opponents still act behind them.
  const order: number[] = [];
  let seat = engine.dealerSeat;
  const nextActive = (from: number) => {
    let i = (from + 1) % players.length;
    while (players[i].sittingOut) i = (i + 1) % players.length;
    return i;
  };
  const sbSeat = nextActive(engine.dealerSeat);
  const bbSeat = nextActive(sbSeat);
  seat = nextActive(bbSeat); // first to act preflop ("under the gun")
  while (seat !== sbSeat) {
    order.push(seat);
    seat = nextActive(seat);
  }
  const idx = order.findIndex((s) => players[s].id === 'human');
  if (idx < 0) return null;
  const playersAfter = order.length - 1 - idx + 2; // later seats (incl. button) + both blinds
  // The button was already handled above, so the human sits among the first
  // order.length-1 seats; classify within those (otherwise the cutoff — last
  // seat before the button — would wrongly land in "middle").
  const nonButtonCount = order.length - 1;
  const fraction = nonButtonCount <= 1 ? 1 : idx / (nonButtonCount - 1);

  if (fraction < 0.34) {
    return {
      key: 'early',
      pokerName: idx === 0 ? 'Under the gun (first to act)' : 'Early position',
      plain: 'First to act (Early)',
      tone: 'red',
      playersAfter,
      tip: `${playersAfter} player${playersAfter === 1 ? '' : 's'} still act after you — play only strong hands here.`,
      explainer: [
        `You act before ${playersAfter} other player${playersAfter === 1 ? '' : 's'} this round. They all get to see your move before making theirs — and you learn nothing about their hands first.`,
        'With that many people behind you, the chance someone holds a strong hand is high. That\'s why early seats play the fewest hands: stick to the clearly strong ones and fold the rest without regret.',
        'Poker name: the very first seat is called "under the gun" — because the pressure is on you.',
      ],
    };
  }
  if (fraction < 0.67) {
    return {
      key: 'middle',
      pokerName: 'Middle position',
      plain: 'Middle',
      tone: 'amber',
      playersAfter,
      tip: `${playersAfter} players still act after you — decent hands are playable, marginal ones still fold.`,
      explainer: [
        `You're in the middle of the order: some players have already acted (and folding told you something), but ${playersAfter} still lurk behind you.`,
        'You can play a few more hands than the early seats, but the same logic applies — every player still to act is a reason for caution with marginal cards.',
      ],
    };
  }
  return {
    key: 'late',
    pokerName: idx === order.length - 1 ? 'Cutoff (one before the button)' : 'Late position',
    plain: 'Late — good seat',
    tone: 'green',
    playersAfter,
    tip: `Only ${playersAfter} player${playersAfter === 1 ? '' : 's'} left behind you — you can play more hands from here.`,
    explainer: [
      `Almost everyone has already acted. Only ${playersAfter} player${playersAfter === 1 ? '' : 's'} (mostly the blinds) can still surprise you.`,
      'If the players before you folded, a raise here often wins the blinds outright — and when you do see a flop, you\'ll usually act after your opponents on every round. This is where marginal hands become playable.',
    ],
  };
}
