import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Card } from '../engine/deck';
import * as theme from './theme';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export const CARD_W = 44;
export const CARD_H = 62;
export const CARD_W_SM = 30;
export const CARD_H_SM = 42;

export function drawCardBack(w = CARD_W, h = CARD_H): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 6)
    .fill(theme.CARD_BACK_A)
    .stroke({ width: 1.5, color: 0x000000, alpha: 0.4 });
  // Diamond lattice pattern for a "real card back" feel.
  const inset = 5;
  g.roundRect(inset, inset, w - inset * 2, h - inset * 2, 4).stroke({ width: 1, color: theme.GOLD, alpha: 0.5 });
  for (let x = inset; x < w - inset; x += 7) {
    g.moveTo(x, inset).lineTo(x + 7, h - inset).stroke({ width: 0.6, color: theme.CARD_BACK_B, alpha: 0.6 });
  }
  c.addChild(g);
  return c;
}

export function drawCardFace(card: Card, w = CARD_W, h = CARD_H): Container {
  const c = new Container();
  const isRed = RED_SUITS.has(card.suit);
  const color = isRed ? theme.CARD_RED : theme.CARD_BLACK;

  const g = new Graphics();
  g.roundRect(0, 0, w, h, 6).fill(theme.CARD_WHITE).stroke({ width: 1, color: 0x000000, alpha: 0.3 });
  c.addChild(g);

  const rankStyle = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: w * 0.32, fontWeight: 'bold', fill: color });
  const suitStyle = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: w * 0.26, fill: color });

  const rankText = new Text({ text: card.rank, style: rankStyle });
  rankText.anchor.set(0.5, 0);
  rankText.position.set(w / 2, h * 0.08);
  c.addChild(rankText);

  const suitText = new Text({ text: SUIT_SYMBOLS[card.suit], style: suitStyle });
  suitText.anchor.set(0.5, 0);
  suitText.position.set(w / 2, h * 0.46);
  c.addChild(suitText);

  return c;
}

export function drawChipStack(amount: number): Container {
  const c = new Container();
  const chips = theme.chipBreakdown(amount);
  const radius = 9;
  chips.forEach((chip, i) => {
    const y = -i * 3;
    const shadow = new Graphics();
    shadow.ellipse(0, y + 2, radius, radius * 0.55).fill({ color: 0x000000, alpha: 0.15 });
    c.addChild(shadow);

    const g = new Graphics();
    g.circle(0, y - 2, radius).fill(chip.color).stroke({ width: 1.5, color: chip.ring });
    g.circle(0, y - 2, radius - 3).stroke({ width: 1, color: chip.ring, alpha: 0.6 });
    c.addChild(g);
  });

  const labelStyle = new TextStyle({
    fontFamily: 'system-ui, sans-serif',
    fontSize: 11,
    fontWeight: 'bold',
    fill: theme.GOLD_BRIGHT,
    stroke: { color: 0x000000, width: 3 },
  });
  const label = new Text({ text: String(amount), style: labelStyle });
  label.anchor.set(0.5, 1);
  label.position.set(0, -chips.length * 3 - 10);
  c.addChild(label);

  return c;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];
const HAIR_COLORS = [0x1c1c1c, 0x3b2a1a, 0x6b4423, 0xb8860b, 0x4a4a4a, 0xffffff];

// A small set of deterministic, procedurally-varied cartoon faces (no image
// assets) so each seat is visually distinct and easy to tell apart at a glance.
export function drawFace(seed: string, radius: number, accent: number): Container {
  const c = new Container();
  const h = hashSeed(seed);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_COLORS[(h >> 3) % HAIR_COLORS.length];
  const hairStyle = (h >> 6) % 4; // 0=bald, 1=short, 2=full, 3=cap
  const hasFacialHair = (h >> 8) % 3 === 0;
  const wearsShades = (h >> 10) % 4 === 0;

  const ring = new Graphics();
  ring.circle(0, 0, radius + 2).stroke({ width: 2, color: accent });
  c.addChild(ring);

  const face = new Graphics();
  face.circle(0, 0, radius).fill(skin);
  c.addChild(face);

  if (hairStyle === 2) {
    const fullHair = new Graphics();
    fullHair.circle(0, -radius * 0.15, radius * 1.02).fill(hair);
    c.addChild(fullHair);
    const reface = new Graphics();
    reface.ellipse(0, radius * 0.18, radius * 0.92, radius * 0.85).fill(skin);
    c.addChild(reface);
  } else if (hairStyle === 1) {
    const topHair = new Graphics();
    topHair.arc(0, 0, radius * 0.95, Math.PI, 2 * Math.PI).fill(hair);
    topHair.position.set(0, -radius * 0.05);
    c.addChild(topHair);
  } else if (hairStyle === 3) {
    const cap = new Graphics();
    cap.arc(0, 0, radius * 1.05, Math.PI * 1.05, Math.PI * 1.95).fill(accent);
    cap.position.set(0, -radius * 0.1);
    c.addChild(cap);
  }

  if (wearsShades) {
    const shades = new Graphics();
    shades
      .roundRect(-radius * 0.62, -radius * 0.12, radius * 0.5, radius * 0.32, 3)
      .roundRect(radius * 0.12, -radius * 0.12, radius * 0.5, radius * 0.32, 3)
      .fill(0x111111);
    shades.moveTo(-radius * 0.12, 0).lineTo(radius * 0.12, 0).stroke({ width: 1.5, color: 0x111111 });
    c.addChild(shades);
  } else {
    const eyes = new Graphics();
    eyes.circle(-radius * 0.35, -radius * 0.05, radius * 0.1).circle(radius * 0.35, -radius * 0.05, radius * 0.1).fill(0x1a1a1a);
    c.addChild(eyes);
  }

  const mouth = new Graphics();
  mouth.moveTo(-radius * 0.32, radius * 0.42).quadraticCurveTo(0, radius * 0.58, radius * 0.32, radius * 0.42);
  mouth.stroke({ width: radius * 0.1, color: 0x7a3b2e, cap: 'round' });
  c.addChild(mouth);

  if (hasFacialHair) {
    const stache = new Graphics();
    stache.roundRect(-radius * 0.3, radius * 0.2, radius * 0.6, radius * 0.16, 3).fill(hair);
    c.addChild(stache);
  }

  return c;
}

export function drawBadge(text: string, color: number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = text.length > 1 ? 22 : 18;
  g.circle(0, 0, w / 2).fill(color).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
  c.addChild(g);
  const style = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: 'bold', fill: 0x0b0b0b });
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  c.addChild(t);
  return c;
}
