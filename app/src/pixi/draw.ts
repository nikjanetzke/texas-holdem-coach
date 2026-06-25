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

export function drawAvatar(initial: string, radius: number, accent: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, radius).fill(0x1c2531).stroke({ width: 2, color: accent });
  g.circle(0, 0, radius - 3).fill({ color: accent, alpha: 0.12 });
  c.addChild(g);

  const style = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: radius, fontWeight: 'bold', fill: 0xe5e7eb });
  const text = new Text({ text: initial.toUpperCase(), style });
  text.anchor.set(0.5);
  c.addChild(text);
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
