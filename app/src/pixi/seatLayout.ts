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
