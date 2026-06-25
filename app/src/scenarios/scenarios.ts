import type { GameSetup, SeatConfig } from '../hooks/useGame';
import { AI_ARCHETYPES } from '../ai/profiles';
import type { AIProfile } from '../ai/profiles';
import type { LuckBand } from '../engine/preflop';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  build: () => GameSetup;
}

let seatCounter = 0;
function ai(profile: AIProfile, stack: number): SeatConfig {
  seatCounter++;
  return { id: `ai-${seatCounter}`, name: `${profile.name} ${seatCounter}`, isHuman: false, profile, stack };
}
function human(stack: number): SeatConfig {
  return { id: 'human', name: 'You', isHuman: true, stack };
}

function setup(seats: SeatConfig[], scheduleId: string, name: string, cardLuck?: LuckBand): GameSetup {
  return { seats, startingStack: 1000, scheduleId, cardLuck, scenarioName: name };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'short-stack-hu',
    name: 'Short-stack heads-up',
    description: 'You hold ~12 big blinds heads-up against an aggressive opponent. Practice shove-or-fold pressure.',
    build: () => {
      seatCounter = 0;
      return setup([human(600), ai(AI_ARCHETYPES.looseAggressive, 2400)], 'turbo', 'Short-stack heads-up');
    },
  },
  {
    id: 'big-stack-bully',
    name: 'Big-stack bully (6-max)',
    description: 'You sit deep with a commanding stack while everyone else is short. Practice applying pressure.',
    build: () => {
      seatCounter = 0;
      return setup(
        [
          human(4000),
          ai(AI_ARCHETYPES.tight, 800),
          ai(AI_ARCHETYPES.callingStation, 700),
          ai(AI_ARCHETYPES.looseAggressive, 900),
          ai(AI_ARCHETYPES.tight, 750),
          ai(AI_ARCHETYPES.callingStation, 850),
        ],
        'standard',
        'Big-stack bully (6-max)',
      );
    },
  },
  {
    id: 'medium-6max',
    name: 'Even 6-max grind',
    description: 'A balanced 6-handed table with mixed opponent styles and even stacks. General practice.',
    build: () => {
      seatCounter = 0;
      return setup(
        [
          human(2000),
          ai(AI_ARCHETYPES.tight, 2000),
          ai(AI_ARCHETYPES.looseAggressive, 2000),
          ai(AI_ARCHETYPES.callingStation, 2000),
          ai(AI_ARCHETYPES.tight, 2000),
          ai(AI_ARCHETYPES.looseAggressive, 2000),
        ],
        'standard',
        'Even 6-max grind',
      );
    },
  },
  {
    id: 'card-dead',
    name: 'Card-dead day',
    description: 'You keep being dealt weak starting hands. Practice patience and disciplined folding.',
    build: () => {
      seatCounter = 0;
      return setup(
        [
          human(2000),
          ai(AI_ARCHETYPES.looseAggressive, 2000),
          ai(AI_ARCHETYPES.tight, 2000),
          ai(AI_ARCHETYPES.callingStation, 2000),
          ai(AI_ARCHETYPES.looseAggressive, 2000),
          ai(AI_ARCHETYPES.tight, 2000),
        ],
        'standard',
        'Card-dead day',
        'cold',
      );
    },
  },
  {
    id: 'running-hot',
    name: 'Running hot',
    description: 'You keep picking up premium hands. Practice extracting maximum value without scaring opponents off.',
    build: () => {
      seatCounter = 0;
      return setup(
        [
          human(2000),
          ai(AI_ARCHETYPES.callingStation, 2000),
          ai(AI_ARCHETYPES.tight, 2000),
          ai(AI_ARCHETYPES.callingStation, 2000),
          ai(AI_ARCHETYPES.looseAggressive, 2000),
          ai(AI_ARCHETYPES.tight, 2000),
        ],
        'standard',
        'Running hot',
        'hot',
      );
    },
  },
];
