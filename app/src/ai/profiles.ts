export interface AIProfile {
  id: string;
  name: string;
  /** Short label for on-table display, e.g. "Tight" — the full name is too long for a seat box. */
  shortName: string;
  /** 0 = plays almost any hand, 1 = only plays premium hands */
  tightness: number;
  /** 0 = passive (checks/calls), 1 = aggressive (bets/raises often) */
  aggression: number;
  /** 0 = never bluffs, 1 = bluffs very often */
  bluffFrequency: number;
  /** 0 = folds to pressure easily, 1 = calls almost anything */
  callingFrequency: number;
  /** Flavor lines spoken (shown as a speech bubble) when taking these actions. */
  catchphrases: Partial<Record<'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in', string[]>>;
}

export const AI_ARCHETYPES: Record<string, AIProfile> = {
  tight: {
    id: 'tight',
    name: 'Tight Conservative',
    shortName: 'Tight',
    tightness: 0.75,
    aggression: 0.4,
    bluffFrequency: 0.05,
    callingFrequency: 0.35,
    catchphrases: {
      fold: ['Not for me.', "I'll wait for a better spot."],
      call: ["I'll see one more card."],
      bet: ['I like this one.'],
      raise: ["Let's find out where we stand."],
      'all-in': ["I don't get this one often."],
    },
  },
  looseAggressive: {
    id: 'looseAggressive',
    name: 'Aggressive Bluffer',
    shortName: 'Aggro',
    tightness: 0.25,
    aggression: 0.8,
    bluffFrequency: 0.35,
    callingFrequency: 0.55,
    catchphrases: {
      fold: ['Fine, take it.'],
      bet: ['Pressure time.'],
      raise: ["Let's gamble!"],
      'all-in': ["I'm not folding this!"],
      call: ["I'll keep you honest."],
    },
  },
  callingStation: {
    id: 'callingStation',
    name: 'Calling Station',
    shortName: 'Caller',
    tightness: 0.2,
    aggression: 0.2,
    bluffFrequency: 0.05,
    callingFrequency: 0.85,
    catchphrases: {
      call: ["I just gotta see it."],
      fold: ['Okay, you got me.'],
      check: ["I'll take a free card."],
      bet: ['Worth a shot.'],
    },
  },
};
