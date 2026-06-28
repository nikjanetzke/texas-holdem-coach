import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Card } from '../engine/deck';
import * as theme from './theme';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

// Cards store the ten as 'T'; players expect to see "10".
export function rankLabel(rank: Card['rank']): string {
  return rank === 'T' ? '10' : rank;
}

export const CARD_W = 78;
export const CARD_H = 110;
export const CARD_W_SM = 57;
export const CARD_H_SM = 80;

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

  const label = rankLabel(card.rank);
  // The two-character "10" needs a slightly smaller glyph to fit the card width.
  const rankStyle = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: w * (label.length > 1 ? 0.34 : 0.44), fontWeight: 'bold', fill: color });
  const suitStyle = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: w * 0.66, fill: color });

  const rankText = new Text({ text: label, style: rankStyle });
  rankText.anchor.set(0.5, 0);
  rankText.position.set(w / 2, h * 0.04);
  c.addChild(rankText);

  const suitText = new Text({ text: SUIT_SYMBOLS[card.suit], style: suitStyle });
  suitText.anchor.set(0.5, 0.5);
  suitText.position.set(w / 2, h * 0.62);
  c.addChild(suitText);

  return c;
}

const CHIP_R = 11;
const CHIP_RY = CHIP_R * 0.42; // squashed ellipse for a 3/4 view
const CHIP_TH = 4.2; // visible thickness per chip in a stack
const CHIP_PER_COL = 6; // chips before starting a new column

// A single realistic poker chip (cylinder side + top face + edge spots + ring),
// drawn so a column of them reads as a glossy clay stack rather than flat discs.
function drawChip(c: Container, x: number, y: number, color: number, ring: number, topFace: boolean) {
  const g = new Graphics();
  // Cylinder side (the thickness you see under the top face).
  g.ellipse(x, y + CHIP_TH, CHIP_R, CHIP_RY).fill(shade(color, -55));
  g.rect(x - CHIP_R, y, CHIP_R * 2, CHIP_TH).fill(shade(color, -55));
  // Top face + rim.
  g.ellipse(x, y, CHIP_R, CHIP_RY).fill(color).stroke({ width: 1, color: shade(color, 35) });
  c.addChild(g);

  // Edge spots + inner ring only on the top chip of a column (keeps it crisp).
  if (topFace) {
    const spots = new Graphics();
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      const sx = x + Math.cos(ang) * CHIP_R * 0.82;
      const sy = y + Math.sin(ang) * CHIP_RY * 0.82;
      spots.ellipse(sx, sy, 1.7, 1.1).fill({ color: ring, alpha: 0.95 });
    }
    spots.ellipse(x, y, CHIP_R * 0.5, CHIP_RY * 0.5).stroke({ width: 1, color: ring, alpha: 0.85 });
    // Soft top highlight for gloss.
    spots.ellipse(x - CHIP_R * 0.25, y - CHIP_RY * 0.3, CHIP_R * 0.4, CHIP_RY * 0.35).fill({ color: 0xffffff, alpha: 0.12 });
    c.addChild(spots);
  }
}

export function drawChipStack(amount: number, showLabel = true): Container {
  const c = new Container();
  // Up to 20 chips so larger stacks visibly grow (≈10 tiers from tiny to huge).
  const chips = theme.chipBreakdown(amount, 20);
  const cols = Math.max(1, Math.ceil(chips.length / CHIP_PER_COL));
  let tallest = 0;

  chips.forEach((chip, idx) => {
    const col = Math.floor(idx / CHIP_PER_COL);
    const row = idx % CHIP_PER_COL;
    const colHeight = Math.min(CHIP_PER_COL, chips.length - col * CHIP_PER_COL);
    const x = (col - (cols - 1) / 2) * (CHIP_R * 1.9);
    const y = -row * CHIP_TH;
    const isTop = row === colHeight - 1;
    if (row === 0) {
      const shadow = new Graphics();
      shadow.ellipse(x, CHIP_TH + 2, CHIP_R * 1.05, CHIP_RY * 1.1).fill({ color: 0x000000, alpha: 0.22 });
      c.addChild(shadow);
    }
    drawChip(c, x, y, chip.color, chip.ring, isTop);
    tallest = Math.max(tallest, colHeight);
  });

  if (showLabel) {
    const labelStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      fontWeight: 'bold',
      fill: theme.GOLD_BRIGHT,
      stroke: { color: 0x000000, width: 3 },
    });
    const label = new Text({ text: `$${amount.toLocaleString()}`, style: labelStyle });
    label.anchor.set(0.5, 1);
    label.position.set(0, -tallest * CHIP_TH - 12);
    c.addChild(label);
  }

  return c;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const SKIN_TONES = [0xffe0bd, 0xf1c27d, 0xe0ac69, 0xc68642, 0xa9764f, 0x8d5524, 0x6b4226, 0x4a2f23];
const HAIR_COLORS = [0x0c0c0c, 0x2b1a10, 0x4a2c14, 0x6b4423, 0x8a5a2b, 0xb8860b, 0xc9a876, 0x5c5c5c, 0xe8e8e8, 0x7a2e1d];
const FACE_SHAPES: Array<'oval' | 'round' | 'square' | 'long' | 'heart'> = ['oval', 'round', 'square', 'long', 'heart'];
const EYE_SHAPES: Array<'round' | 'almond' | 'sleepy' | 'wide'> = ['round', 'almond', 'sleepy', 'wide'];
const BEARD_STYLES: Array<'none' | 'stache' | 'goatee' | 'full' | 'stubble'> = ['none', 'stache', 'goatee', 'full', 'stubble'];

function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const adj = (ch: number) => Math.max(0, Math.min(255, Math.round(ch + amount)));
  return (adj(r) << 16) | (adj(g) << 8) | adj(b);
}

// Deterministic, procedurally-varied portrait faces (no image assets) so each
// seat is visually distinct at a glance. Draws layered shading, face-shape
// variety, brows/eyes, and hair/beard combinations from a wide hashed palette
// so seeds spread out across many more visually-distinct combinations than a
// flat-color cartoon face would.
export function drawFace(seed: string, radius: number, accent: number): Container {
  const c = new Container();
  const h = hashSeed(seed);
  const h2 = hashSeed(seed + ':2');

  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const skinLight = shade(skin, 26);
  const skinDark = shade(skin, -34);
  const hair = HAIR_COLORS[(h >> 3) % HAIR_COLORS.length];
  const hairStyle = (h >> 6) % 5; // 0=bald, 1=short, 2=full, 3=cap, 4=long/wavy
  const beard = BEARD_STYLES[(h >> 8) % BEARD_STYLES.length];
  const wearsShades = (h >> 10) % 5 === 0;
  const faceShape = FACE_SHAPES[(h2 >> 2) % FACE_SHAPES.length];
  const eyeShape = EYE_SHAPES[(h2 >> 5) % EYE_SHAPES.length];
  const browHeavy = (h2 >> 7) % 2 === 0;
  const eyeColor = [0x2e1e0f, 0x1a1a1a, 0x3a5a40, 0x355070][(h2 >> 9) % 4];
  const wScale = faceShape === 'square' ? 1.06 : faceShape === 'long' ? 0.86 : faceShape === 'heart' ? 0.96 : 1;
  const hScale = faceShape === 'long' ? 1.16 : faceShape === 'round' ? 0.92 : 1;

  const ring = new Graphics();
  ring.circle(0, 0, radius + 2).stroke({ width: 2, color: accent });
  c.addChild(ring);

  // Base head shape with a subtle directional light gradient approximated by
  // two offset overlay ellipses (Pixi has no native radial-gradient fill).
  const headW = radius * wScale;
  const headH = radius * hScale;
  const faceShapeG = new Graphics();
  if (faceShape === 'square') {
    faceShapeG.roundRect(-headW, -headH, headW * 2, headH * 2, headW * 0.35);
  } else if (faceShape === 'heart') {
    faceShapeG.ellipse(0, -headH * 0.15, headW, headH * 0.8);
    faceShapeG.poly([-headW * 0.7, headH * 0.15, headW * 0.7, headH * 0.15, 0, headH * 1.05]);
  } else {
    faceShapeG.ellipse(0, 0, headW, headH);
  }
  faceShapeG.fill(skin);
  c.addChild(faceShapeG);

  const highlight = new Graphics();
  highlight.ellipse(-headW * 0.32, -headH * 0.38, headW * 0.55, headH * 0.45).fill({ color: skinLight, alpha: 0.5 });
  c.addChild(highlight);
  const shadow = new Graphics();
  shadow.ellipse(headW * 0.4, headH * 0.45, headW * 0.5, headH * 0.4).fill({ color: skinDark, alpha: 0.3 });
  c.addChild(shadow);

  // Hair (drawn after base shading, before facial features so fringe sits on top of forehead)
  if (hairStyle === 2) {
    const fullHair = new Graphics();
    fullHair.ellipse(0, -headH * 0.25, headW * 1.06, headH * 0.95).fill(hair);
    c.addChild(fullHair);
    const reface = new Graphics();
    reface.ellipse(0, headH * 0.12, headW * 0.95, headH * 0.85).fill(skin);
    c.addChild(reface);
    const reHighlight = new Graphics();
    reHighlight.ellipse(-headW * 0.3, -headH * 0.1, headW * 0.5, headH * 0.4).fill({ color: skinLight, alpha: 0.4 });
    c.addChild(reHighlight);
  } else if (hairStyle === 1) {
    const topHair = new Graphics();
    topHair.arc(0, -headH * 0.05, headW * 1.0, Math.PI * 0.95, Math.PI * 2.05).fill(hair);
    c.addChild(topHair);
  } else if (hairStyle === 3) {
    const cap = new Graphics();
    cap.arc(0, -headH * 0.1, headW * 1.08, Math.PI * 1.02, Math.PI * 1.98).fill(accent);
    const brim = new Graphics();
    brim.ellipse(0, -headH * 0.08, headW * 1.12, headH * 0.12).fill(shade(accent, -30));
    c.addChild(cap);
    c.addChild(brim);
  } else if (hairStyle === 4) {
    const wavyHair = new Graphics();
    wavyHair.ellipse(0, -headH * 0.22, headW * 1.05, headH * 0.9).fill(hair);
    wavyHair.ellipse(-headW * 0.95, headH * 0.15, headW * 0.32, headH * 0.55).fill(hair);
    wavyHair.ellipse(headW * 0.95, headH * 0.15, headW * 0.32, headH * 0.55).fill(hair);
    c.addChild(wavyHair);
    const reface = new Graphics();
    reface.ellipse(0, headH * 0.1, headW * 0.92, headH * 0.85).fill(skin);
    c.addChild(reface);
  }

  // Eyebrows
  const browY = -headH * 0.18;
  const brows = new Graphics();
  const browW = headW * 0.32;
  const browWt = browHeavy ? 3.2 : 1.8;
  brows
    .moveTo(-headW * 0.5, browY).lineTo(-headW * 0.5 + browW, browY - headH * 0.04)
    .stroke({ width: browWt, color: shade(hair, -10), cap: 'round' })
    .moveTo(headW * 0.5, browY).lineTo(headW * 0.5 - browW, browY - headH * 0.04)
    .stroke({ width: browWt, color: shade(hair, -10), cap: 'round' });
  c.addChild(brows);

  // Eyes
  if (wearsShades) {
    const shades = new Graphics();
    shades
      .roundRect(-headW * 0.62, -headH * 0.1, headW * 0.5, headH * 0.32, 3)
      .roundRect(headW * 0.12, -headH * 0.1, headW * 0.5, headH * 0.32, 3)
      .fill(0x111111);
    shades.moveTo(-headW * 0.12, headH * 0.02).lineTo(headW * 0.12, headH * 0.02).stroke({ width: 1.5, color: 0x111111 });
    c.addChild(shades);
  } else {
    const eyeY = eyeShape === 'sleepy' ? headH * 0.02 : -headH * 0.02;
    const eyeRx = eyeShape === 'wide' ? headW * 0.13 : headW * 0.1;
    const eyeRy = eyeShape === 'almond' ? headH * 0.06 : eyeShape === 'sleepy' ? headH * 0.045 : headH * 0.08;
    const whites = new Graphics();
    whites.ellipse(-headW * 0.32, eyeY, eyeRx, eyeRy).ellipse(headW * 0.32, eyeY, eyeRx, eyeRy).fill(0xffffff);
    c.addChild(whites);
    const pupils = new Graphics();
    pupils.circle(-headW * 0.32, eyeY, eyeRy * 0.6).circle(headW * 0.32, eyeY, eyeRy * 0.6).fill(eyeColor);
    c.addChild(pupils);
    if (eyeShape === 'sleepy') {
      const lids = new Graphics();
      lids
        .moveTo(-headW * 0.45, eyeY - eyeRy * 0.6).lineTo(-headW * 0.18, eyeY - eyeRy * 0.6)
        .moveTo(headW * 0.18, eyeY - eyeRy * 0.6).lineTo(headW * 0.45, eyeY - eyeRy * 0.6)
        .stroke({ width: 1.5, color: skinDark, alpha: 0.5 });
      c.addChild(lids);
    }
  }

  // Nose (subtle line shading, no flat circle)
  const nose = new Graphics();
  nose.moveTo(0, -headH * 0.02).lineTo(-headW * 0.06, headH * 0.18).lineTo(headW * 0.06, headH * 0.18 + 1);
  nose.stroke({ width: 1.2, color: skinDark, alpha: 0.55, cap: 'round' });
  c.addChild(nose);

  // Mouth
  const mouth = new Graphics();
  mouth.moveTo(-headW * 0.3, headH * 0.5).quadraticCurveTo(0, headH * 0.62, headW * 0.3, headH * 0.5);
  mouth.stroke({ width: headW * 0.09, color: 0x8a3b34, cap: 'round' });
  c.addChild(mouth);

  // Facial hair
  if (beard === 'stache') {
    const stache = new Graphics();
    stache.roundRect(-headW * 0.28, headH * 0.32, headW * 0.56, headH * 0.13, 3).fill(hair);
    c.addChild(stache);
  } else if (beard === 'goatee') {
    const goatee = new Graphics();
    goatee.roundRect(-headW * 0.16, headH * 0.55, headW * 0.32, headH * 0.32, headW * 0.12).fill(hair);
    c.addChild(goatee);
  } else if (beard === 'full') {
    const full = new Graphics();
    full.ellipse(0, headH * 0.55, headW * 0.78, headH * 0.55).fill({ color: hair, alpha: 0.95 });
    const cutout = new Graphics();
    cutout.ellipse(0, headH * 0.42, headW * 0.5, headH * 0.28).fill(skin);
    c.addChild(full);
    c.addChild(cutout);
  } else if (beard === 'stubble') {
    const stubble = new Graphics();
    stubble.ellipse(0, headH * 0.58, headW * 0.65, headH * 0.42).fill({ color: hair, alpha: 0.22 });
    c.addChild(stubble);
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
