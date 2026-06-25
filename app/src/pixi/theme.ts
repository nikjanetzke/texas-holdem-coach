export const FELT_DARK = 0x0b3d24;
export const FELT_LIGHT = 0x115c34;
export const RAIL_WOOD = 0x4a2c14;
export const RAIL_WOOD_DARK = 0x2c1808;
export const GOLD = 0xd4af37;
export const GOLD_BRIGHT = 0xf4d35e;
export const CARD_WHITE = 0xfaf8f2;
export const CARD_RED = 0xb91c1c;
export const CARD_BLACK = 0x1a1a1a;
export const CARD_BACK_A = 0x7a1f2b;
export const CARD_BACK_B = 0x4a0f17;
export const SEAT_BG = 0x10151c;
export const SEAT_BORDER = 0x3a4150;
export const ACTING_RING = 0xf4d35e;
export const WINNER_GOLD = 0xffd700;

export const CHIP_DENOMS: { value: number; color: number; ring: number }[] = [
  { value: 1000, color: 0x7c3aed, ring: 0xe9d5ff },
  { value: 500, color: 0x1d4ed8, ring: 0xbfdbfe },
  { value: 100, color: 0x111111, ring: 0xd4af37 },
  { value: 25, color: 0x15803d, ring: 0xbbf7d0 },
  { value: 5, color: 0xb91c1c, ring: 0xfecaca },
  { value: 1, color: 0xe5e7eb, ring: 0x9ca3af },
];

export function chipBreakdown(amount: number, maxChips = 6): { value: number; color: number; ring: number }[] {
  const chips: { value: number; color: number; ring: number }[] = [];
  let remaining = amount;
  for (const denom of CHIP_DENOMS) {
    while (remaining >= denom.value && chips.length < maxChips) {
      chips.push(denom);
      remaining -= denom.value;
    }
  }
  if (chips.length === 0 && amount > 0) chips.push(CHIP_DENOMS[CHIP_DENOMS.length - 1]);
  return chips;
}
