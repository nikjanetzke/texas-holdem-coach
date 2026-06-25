export interface AIProfile {
  id: string;
  name: string;
  /** 0 = plays almost any hand, 1 = only plays premium hands */
  tightness: number;
  /** 0 = passive (checks/calls), 1 = aggressive (bets/raises often) */
  aggression: number;
  /** 0 = never bluffs, 1 = bluffs very often */
  bluffFrequency: number;
  /** 0 = folds to pressure easily, 1 = calls almost anything */
  callingFrequency: number;
}

export const AI_ARCHETYPES: Record<string, AIProfile> = {
  tight: {
    id: 'tight',
    name: 'Tight Conservative',
    tightness: 0.75,
    aggression: 0.4,
    bluffFrequency: 0.05,
    callingFrequency: 0.35,
  },
  looseAggressive: {
    id: 'looseAggressive',
    name: 'Aggressive Bluffer',
    tightness: 0.25,
    aggression: 0.8,
    bluffFrequency: 0.35,
    callingFrequency: 0.55,
  },
  callingStation: {
    id: 'callingStation',
    name: 'Calling Station',
    tightness: 0.2,
    aggression: 0.2,
    bluffFrequency: 0.05,
    callingFrequency: 0.85,
  },
};
