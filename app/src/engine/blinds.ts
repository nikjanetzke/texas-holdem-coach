export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  ante: number;
}

export interface BlindSchedule {
  id: string;
  name: string;
  description: string;
  defaultLevelMinutes: number;
  levels: BlindLevel[];
}

const lvl = (smallBlind: number, bigBlind: number, ante = 0): BlindLevel => ({ smallBlind, bigBlind, ante });

export const BLIND_SCHEDULES: Record<string, BlindSchedule> = {
  turbo: {
    id: 'turbo',
    name: 'Turbo',
    description: 'Blinds double every level — fast, high-pressure play.',
    defaultLevelMinutes: 5,
    levels: [
      lvl(25, 50),
      lvl(50, 100),
      lvl(100, 200),
      lvl(200, 400),
      lvl(400, 800),
      lvl(800, 1600),
      lvl(1600, 3200),
      lvl(3200, 6400),
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Gradual ~1.5x steps with antes from level 5.',
    defaultLevelMinutes: 10,
    levels: [
      lvl(25, 50),
      lvl(50, 100),
      lvl(75, 150),
      lvl(100, 200),
      lvl(150, 300, 25),
      lvl(200, 400, 50),
      lvl(300, 600, 75),
      lvl(400, 800, 100),
      lvl(600, 1200, 150),
    ],
  },
  deep: {
    id: 'deep',
    name: 'Deep',
    description: 'Gentle escalation for more post-flop play.',
    defaultLevelMinutes: 15,
    levels: [
      lvl(25, 50),
      lvl(40, 80),
      lvl(60, 120),
      lvl(100, 200),
      lvl(150, 300),
      lvl(200, 400, 50),
      lvl(300, 600, 75),
      lvl(400, 800, 100),
    ],
  },
};

export const DEFAULT_SCHEDULE_ID = 'standard';

/** Returns the blind level for a given index, clamping to the last (highest) level. */
export function levelAt(schedule: BlindSchedule, index: number): BlindLevel {
  return schedule.levels[Math.min(index, schedule.levels.length - 1)];
}
