// Seat geometry for the table canvas, kept free of pixi.js so it can be unit
// tested in node.

export const SEAT_BOX_W = 172;
export const SEAT_BOX_H = 158;

// Shrink seat boxes as the table fills up so 7–10 players don't overlap.
// (~10% smaller across the board than the first pass, for extra breathing room.)
export function seatScaleFor(total: number): number {
  if (total <= 6) return 0.92;
  if (total === 7) return 0.81;
  if (total === 8) return 0.74;
  if (total === 9) return 0.67;
  return 0.61; // 10
}

export function seatPosition(index: number, total: number, w: number, h: number) {
  const theta = (index / total) * 2 * Math.PI;
  // Vertical spread kept tight enough that the tall seat boxes at the top and
  // bottom of the oval stay fully on-canvas (heads no longer clipped).
  // Horizontal spread is clamped so a seat box (plus its "your turn" glow)
  // never runs off the canvas. Unclamped, a seat exactly at the side of the
  // oval (4-player tables, and the near-side seats at 5 and 8 players) sat at
  // x=62 / x=818 with a 172px-wide box, putting ~24px of it — name, stack and
  // chips — off the edge of the table.
  const half = (SEAT_BOX_W / 2 + 12) * seatScaleFor(total);
  const x = Math.min(w - half, Math.max(half, w / 2 + (w * 0.43) * Math.sin(theta)));
  const y = h / 2 + (h * 0.345) * Math.cos(theta);
  const chipX = x + (w / 2 - x) * 0.32;
  const chipY = y + (h / 2 - y) * 0.32;
  return { x, y, chipX, chipY };
}

// ---------------------------------------------------------------------------
// Keeping things out of each other's way: speech bubbles and folded cards.

export interface Rect {
  x: number; // left
  y: number; // top
  w: number;
  h: number;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Area of `r` that falls outside a w×h canvas. */
function offCanvasArea(r: Rect, w: number, h: number): number {
  return r.w * r.h - overlapArea(r, { x: 0, y: 0, w, h });
}

/** Where the community cards (all five, so nothing jumps as they're dealt) and the pot label sit. */
export const POT_Y = 0.565; // pot label centre, as a fraction of the table height

export function tableCentreRects(w: number, h: number, cardW: number, cardH: number): { board: Rect; pot: Rect } {
  const gap = cardW + 8;
  const boardY = h * 0.43;
  const boardW = 5 * gap;
  return {
    // +6 above for the lift on winning cards at showdown.
    board: { x: w / 2 - boardW / 2, y: boardY - cardH / 2 - 8, w: boardW, h: cardH + 12 },
    // Just under the board — high enough that your own seat's speech bubble
    // fits between it and your seat on every table size.
    pot: { x: w / 2 - 60, y: h * POT_Y - 14, w: 120, h: 28 },
  };
}

/** A seat's box on the canvas (the human's is drawn full size; opponents shrink on crowded tables). */
export function seatBoxRect(index: number, total: number, w: number, h: number, scale: number): Rect {
  const { x, y } = seatPosition(index, total, w, h);
  const bw = SEAT_BOX_W * scale;
  const bh = SEAT_BOX_H * scale;
  return { x: x - bw / 2, y: y - bh / 2, w: bw, h: bh };
}

export type BubbleSide = 'above' | 'left' | 'right';
export const BUBBLE_GAP = 10;

/** The bubble's rectangle for a side, in canvas units. `box` is the speaker's seat box. */
export function bubbleRect(side: BubbleSide, box: Rect, bw: number, bh: number): Rect {
  if (side === 'above') return { x: box.x + box.w / 2 - bw / 2, y: box.y - BUBBLE_GAP - bh, w: bw, h: bh };
  const y = box.y + 6; // level with the name, pointing at the portrait/name row
  return side === 'left' ? { x: box.x - BUBBLE_GAP - bw, y, w: bw, h: bh } : { x: box.x + box.w + BUBBLE_GAP, y, w: bw, h: bh };
}

// Speech bubbles used to always sit above the seat — on the pot label for
// your own seat, off the top of the table for the top seat, and over the
// neighbour above for the side seats. Try above, then the side facing the
// middle of the table, then the other side; take the first that's clear, or
// failing that the one that covers least. Covering the board or the pot
// (`priority`) counts four times as bad as clipping a seat's see-through panel.
export function chooseBubbleSide(
  box: Rect,
  bw: number,
  bh: number,
  obstacles: Rect[],
  w: number,
  h: number,
  priority: Rect[] = [],
): BubbleSide {
  const cx = box.x + box.w / 2;
  const inward: BubbleSide = cx > w / 2 + 1 ? 'left' : 'right';
  const order: BubbleSide[] = ['above', inward, inward === 'left' ? 'right' : 'left'];
  let best: BubbleSide = 'above';
  let bestCost = Infinity;
  for (const side of order) {
    const r = bubbleRect(side, box, bw, bh);
    const cost =
      offCanvasArea(r, w, h) * 4 +
      priority.reduce((sum, o) => sum + overlapArea(r, o) * 4, 0) +
      obstacles.reduce((sum, o) => sum + overlapArea(r, o), 0);
    if (cost === 0) return side;
    if (cost < bestCost) {
      best = side;
      bestCost = cost;
    }
  }
  return best;
}

// Folded cards are tossed onto the felt in front of the seat (part-way to the
// middle). For seats across the top of the table "in front" is the board, so
// the cards landed on the community cards; those seats put them beside the
// box (on the side facing the middle) instead. Returns the toss point: the
// first card's right edge, vertically centred (matching how they're drawn).
export function foldedCardsSpot(
  index: number,
  total: number,
  w: number,
  h: number,
  scale: number,
  cardW: number,
  cardH: number,
  board: Rect,
): { x: number; y: number } {
  const { x, y } = seatPosition(index, total, w, h);
  const fw = cardW * 0.8 * scale;
  const fh = cardH * 0.8 * scale;
  const area = (fx: number, fy: number): Rect => ({ x: fx - fw - 4, y: fy - fh / 2 - 4, w: fw + 16 * scale + 8, h: fh + 5 * scale + 8 });
  const fx = x + (w / 2 - x) * 0.42;
  const fy = y + (h / 2 - y) * 0.42;
  if (overlapArea(area(fx, fy), board) === 0) return { x: fx, y: fy };
  const halfW = (SEAT_BOX_W / 2) * scale;
  const toRight = x <= w / 2 + 1;
  return { x: toRight ? x + halfW + 6 + fw : x - halfW - 6 - 16 * scale, y };
}

export const foldedCardsArea = (spot: { x: number; y: number }, scale: number, cardW: number, cardH: number): Rect => {
  const fw = cardW * 0.8 * scale;
  const fh = cardH * 0.8 * scale;
  return { x: spot.x - fw, y: spot.y - fh / 2, w: fw + 16 * scale, h: fh + 5 * scale };
};

// Chips bet this round sit between the seat and the middle. On some seats
// that point fell inside the seat's own box — your bet was drawn over your
// name, the top seat's over their cards. Try the usual spot, then a little
// further toward the middle, then beside the box (level with the name, on the
// side facing the middle first); take the first that's clear of the seat's own
// box, the other seats and the board/pot. `box` is the box as drawn.
export function betChipsSpot(
  index: number,
  total: number,
  w: number,
  h: number,
  box: Rect,
  obstacles: Rect[] = [],
): { x: number; y: number } {
  const { x, y, chipX, chipY } = seatPosition(index, total, w, h);
  const toward = (f: number) => ({ x: x + (w / 2 - x) * f, y: y + (h / 2 - y) * f });
  const sideY = Math.max(box.y + Math.min(52, box.h * 0.45) + 8, 52);
  const right = { x: box.x + box.w + 26, y: sideY };
  const left = { x: box.x - 26, y: sideY };
  // Your seat (bottom middle) faces right; otherwise face the middle.
  const sides = x <= w / 2 + 1 ? [right, left] : [left, right];
  const candidates = [{ x: chipX, y: chipY }, toward(0.4), toward(0.48), ...sides];
  const clear = (p: { x: number; y: number }) => {
    const a = betChipsArea(p);
    const onCanvas = a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h;
    return onCanvas && overlapArea(a, box) === 0 && obstacles.every((o) => overlapArea(a, o) === 0);
  };
  return candidates.find(clear) ?? { x: chipX, y: chipY };
}

/** Rough area of a bet's chip stack (up to 6 high) plus its $ label, from the stack's base point. */
export const betChipsArea = (spot: { x: number; y: number }): Rect => ({ x: spot.x - 24, y: spot.y - 52, w: 48, h: 60 });
