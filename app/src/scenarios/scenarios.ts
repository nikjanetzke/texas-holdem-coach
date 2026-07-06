import type { GameSetup, SeatConfig } from '../hooks/useGame';
import { PLAYER_AVATAR } from '../hooks/useGame';
import { AI_ARCHETYPES } from '../ai/profiles';
import type { AIProfile } from '../ai/profiles';
import { CHARACTERS } from '../ai/characters';
import type { LuckBand } from '../engine/preflop';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  build: () => GameSetup;
}

// Map each old archetype to named characters whose play style matches, so
// scenarios feature the recurring cast (with photos) instead of generic bots.
const CHAR = (id: string) => CHARACTERS.find((c) => c.id === id)!;
const POOLS: Record<string, AIProfile[]> = {
  tight: [CHAR('eleanor'), CHAR('nadia'), CHAR('tex'), CHAR('professor'), CHAR('raven'), CHAR('cypher')],
  looseAggressive: [CHAR('marco'), CHAR('spike'), CHAR('bruno'), CHAR('ghost')],
  callingStation: [CHAR('leo'), CHAR('danny'), CHAR('rookie')],
};

let seatCounter = 0;
// Tracks how many characters we've already drawn from each archetype pool in the
// current scenario build, so repeated archetypes never land on the same face.
// (Indexing by the global seatCounter instead used to collide — e.g. the 1st and
// 4th "callingStation" seat could both hash to the same 3-person pool slot,
// literally seating the same character twice at one table.)
let poolIndexByArchetype: Record<string, number> = {};

function resetScenarioCounters(): void {
  seatCounter = 0;
  poolIndexByArchetype = {};
}

function ai(profile: AIProfile, stack: number): SeatConfig {
  seatCounter++;
  const key = profile.id;
  const pool = POOLS[key] ?? CHARACTERS;
  const idx = (poolIndexByArchetype[key] ?? 0) % pool.length;
  poolIndexByArchetype[key] = idx + 1;
  const character = pool[idx];
  return { id: `ai-${seatCounter}`, name: character.shortName, isHuman: false, profile: character, stack };
}
function human(stack: number): SeatConfig {
  return { id: 'human', name: 'You', isHuman: true, stack, portrait: PLAYER_AVATAR };
}

function setup(seats: SeatConfig[], scheduleId: string, name: string, id: string, cardLuck?: LuckBand): GameSetup {
  return { seats, startingStack: 1000, scheduleId, cardLuck, scenarioName: name, scenarioId: id };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'short-stack-hu',
    name: 'Short-stack heads-up',
    description: 'You hold ~12 big blinds heads-up against an aggressive opponent. Practice shove-or-fold pressure.',
    build: () => {
      resetScenarioCounters();
      return setup([human(600), ai(AI_ARCHETYPES.looseAggressive, 2400)], 'turbo', 'Short-stack heads-up', 'short-stack-hu');
    },
  },
  {
    id: 'big-stack-bully',
    name: 'Big-stack bully (6-max)',
    description: 'You sit deep with a commanding stack while everyone else is short. Practice applying pressure.',
    build: () => {
      resetScenarioCounters();
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
        'big-stack-bully',
      );
    },
  },
  {
    id: 'medium-6max',
    name: 'Even 6-max grind',
    description: 'A balanced 6-handed table with mixed opponent styles and even stacks. General practice.',
    build: () => {
      resetScenarioCounters();
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
        'medium-6max',
      );
    },
  },
  {
    id: 'card-dead',
    name: 'Card-dead day',
    description: 'You keep being dealt weak starting hands. Practice patience and disciplined folding.',
    build: () => {
      resetScenarioCounters();
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
        'card-dead',
        'cold',
      );
    },
  },
  {
    id: 'running-hot',
    name: 'Running hot',
    description: 'You keep picking up premium hands. Practice extracting maximum value without scaring opponents off.',
    build: () => {
      resetScenarioCounters();
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
        'running-hot',
        'hot',
      );
    },
  },
];
