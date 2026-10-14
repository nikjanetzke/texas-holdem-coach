import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { Card } from '../engine/deck';
import type { HandPlayer } from '../engine/game';
import * as theme from './theme';
import {
  BUBBLE_GAP,
  betChipsSpot,
  POT_Y,
  SEAT_BOX_H,
  SEAT_BOX_W,
  chooseBubbleSide,
  foldedCardsSpot,
  seatBoxRect,
  seatPosition,
  seatScaleFor,
  tableCentreRects,
  type Rect,
} from './seatLayout';
import { drawFace, drawBadge, drawCardBack, drawCardFace, drawChipStack, CARD_W_SM, CARD_H_SM } from './draw';

export interface SeatViewModel {
  player: HandPlayer;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isActing: boolean;
  isWinner: boolean;
  showCards: boolean;
  handLabel?: string;
  /** Most recent action this street, e.g. "Call $50" / "Raise $200" / "Check". */
  lastAction?: string;
  speech?: string;
  portrait?: string;
  /** Opponent note shown on the seat, e.g. "Calls a lot" (coach on only). */
  note?: { text: string; tone: 'red' | 'amber' | 'green' | 'blue' | 'slate' };
}

export interface PokerCanvasProps {
  seats: SeatViewModel[];
  communityCards: Card[];
  potTotal: number;
  /** Increments each new hand; triggers the deal animation. */
  handNumber?: number;
  /** IDs of seats that won the pot; triggers the chip-award animation. */
  winnerIds?: string[];
  /**
   * The winning five-card hand at a showdown. Those cards are lifted and
   * outlined in gold, the rest of the board dimmed, so you can SEE what won —
   * including when a player is just playing the board.
   */
  winningCards?: Card[];
  width?: number;
  height?: number;
  /** Tapping an opponent's seat (used to open their notes). */
  onSeatClick?: (playerId: string) => void;
}

function truncateName(name: string, max = 8): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}


function drawFelt(w: number, h: number): Container {
  const c = new Container();
  const rail = new Graphics();
  rail.roundRect(0, 0, w, h, h * 0.48).fill(theme.RAIL_WOOD_DARK);
  rail.roundRect(0, 0, w, h, h * 0.48).stroke({ width: 3, color: theme.GOLD, alpha: 0.4 });
  c.addChild(rail);

  const inset = Math.min(w, h) * 0.045;
  const felt = new Graphics();
  felt.roundRect(inset, inset, w - inset * 2, h - inset * 2, (h - inset * 2) * 0.48).fill(theme.FELT_LIGHT);
  // subtle radial highlight toward centre to suggest fabric sheen
  felt.ellipse(w / 2, h * 0.4, w * 0.32, h * 0.22).fill({ color: theme.FELT_DARK, alpha: 0.001 });
  c.addChild(felt);

  const innerLine = new Graphics();
  innerLine
    .roundRect(inset + 14, inset + 14, w - (inset + 14) * 2, h - (inset + 14) * 2, (h - inset * 2) * 0.42)
    .stroke({ width: 1.5, color: theme.GOLD, alpha: 0.18 });
  c.addChild(innerLine);

  return c;
}

const LOGICAL_W = 880;
const LOGICAL_H = 500;

// Seat-box geometry, shared between the seat renderer and the muck/deal
// animations so the flying cards line up with where the real cards sit.

const SEAT_CARD_TOP = SEAT_BOX_H / 2 - CARD_H_SM - 8; // top-left y of hole cards within a seat box

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}


const NOTE_COLORS: Record<NonNullable<SeatViewModel['note']>['tone'], number> = {
  red: 0xfca5a5,
  amber: 0xfcd34d,
  green: 0x86efac,
  blue: 0x93c5fd,
  slate: 0xcbd5e1,
};

export function PokerCanvas({ seats, communityCards, potTotal, handNumber, winnerIds, winningCards, width = LOGICAL_W, height = LOGICAL_H, onSeatClick }: PokerCanvasProps) {
  // Read through a ref so the scene (rebuilt on every change) always calls the latest handler.
  const onSeatClickRef = useRef(onSeatClick);
  onSeatClickRef.current = onSeatClick;
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<Container | null>(null);
  // A separate layer above the scene for transient animations. renderScene()
  // clears `scene` on every state change, so anything that must survive across
  // re-renders (flying cards, chips) lives here instead and self-removes.
  const overlayRef = useRef<Container | null>(null);
  // Active animation step functions; each returns true when finished. Driven by
  // the Pixi ticker so tweens run independently of React's render cycle.
  const animationsRef = useRef<Array<(now: number) => boolean>>([]);
  // Snapshots used to detect state transitions worth animating.
  const prevFoldedRef = useRef<Set<string>>(new Set());
  const lastDealtHandRef = useRef<number | undefined>(undefined);
  const lastWinHandRef = useRef<number | undefined>(undefined);
  // Kept in sync every render so the async app.init() callback can pick up
  // the latest size even if width/height changed while init() was pending —
  // otherwise a resize that races ahead of init() completing gets dropped.
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  // Loaded portrait textures keyed by URL. A `null` entry means "tried and
  // failed to load" so we don't keep retrying a missing file every render.
  const portraitCache = useRef<Map<string, Texture | null>>(new Map());
  // The felt-table background image; null until loaded (drawn felt is the fallback).
  const tableTextureRef = useRef<Texture | null>(null);

  // Round avatar: a circular-masked portrait sprite if its texture is loaded,
  // otherwise the procedurally-drawn face. Always wrapped in an accent ring.
  function drawAvatar(seat: SeatViewModel, radius: number, accent: number): Container {
    const tex = seat.portrait ? portraitCache.current.get(seat.portrait) : undefined;
    if (!tex) return drawFace(seat.player.id, radius, accent);

    const c = new Container();
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    // Cover-fit the (assumed roughly square) texture into the circle's diameter.
    const size = radius * 2;
    const scale = size / Math.min(tex.width, tex.height);
    sprite.scale.set(scale);
    const mask = new Graphics();
    mask.circle(0, 0, radius).fill(0xffffff);
    sprite.mask = mask;
    if (seat.player.folded) sprite.alpha = 0.6;
    c.addChild(mask, sprite);
    const ring = new Graphics();
    ring.circle(0, 0, radius + 2).stroke({ width: 2, color: accent });
    c.addChild(ring);
    return c;
  }

  function applySize(app: Application, scene: Container, w: number, h: number) {
    app.renderer.resize(w, h);
    app.canvas.style.width = `${w}px`;
    app.canvas.style.height = `${h}px`;
    scene.scale.set(w / LOGICAL_W, h / LOGICAL_H);
    if (overlayRef.current) overlayRef.current.scale.set(w / LOGICAL_W, h / LOGICAL_H);
  }

  // Mount the Pixi application once; resizing is handled separately by scaling
  // a fixed-logical-size scene to fit the actual canvas dimensions.
  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    appRef.current = app;
    (async () => {
      await app.init({
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      hostRef.current?.appendChild(app.canvas);
      const scene = new Container();
      app.stage.addChild(scene);
      sceneRef.current = scene;
      const overlay = new Container();
      app.stage.addChild(overlay);
      overlayRef.current = overlay;
      // Run all active animation steps each frame; drop the finished ones.
      app.ticker.add(() => {
        if (animationsRef.current.length === 0) return;
        const now = performance.now();
        animationsRef.current = animationsRef.current.filter((step) => !step(now));
      });
      // Pick up the latest width/height in case they changed while init() was pending.
      applySize(app, scene, sizeRef.current.width, sizeRef.current.height);
      renderScene();
      // Load the felt-table background, then redraw with it once ready.
      Assets.load<Texture>('/assets/green-felt-poker-table.jpg')
        .then((tex) => {
          if (destroyed) return;
          tableTextureRef.current = tex;
          try {
            renderScene();
          } catch (err) {
            console.error('PokerCanvas render error', err);
          }
        })
        .catch(() => {});
    })();

    return () => {
      destroyed = true;
      sceneRef.current = null;
      overlayRef.current = null;
      animationsRef.current = [];
      const a = appRef.current;
      appRef.current = null;
      if (a && a.renderer) a.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize the renderer + rescale the logical-coordinate scene to fit, instead
  // of rebuilding the whole Pixi application on every container resize.
  useEffect(() => {
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !app.renderer || !scene) return;
    applySize(app, scene, width, height);
  }, [width, height]);

  function renderScene() {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.removeChildren();
    scene.scale.set(width / LOGICAL_W, height / LOGICAL_H);

    const tableTex = tableTextureRef.current;
    if (tableTex) {
      // Cover-fit the felt image, then clip to a stadium (pill) shape matching
      // the table's oval so the image's square white corners are masked away.
      const sprite = new Sprite(tableTex);
      sprite.anchor.set(0.5);
      const scale = Math.max(LOGICAL_W / tableTex.width, LOGICAL_H / tableTex.height) * 1.02;
      sprite.scale.set(scale);
      sprite.position.set(LOGICAL_W / 2, LOGICAL_H / 2);
      const mask = new Graphics();
      mask.roundRect(2, 2, LOGICAL_W - 4, LOGICAL_H - 4, LOGICAL_H * 0.5).fill(0xffffff);
      sprite.mask = mask;
      scene.addChild(mask, sprite);
    } else {
      scene.addChild(drawFelt(LOGICAL_W, LOGICAL_H));
    }

    // Community cards — same size as the players' hole cards.
    const board = new Container();
    const cardGap = CARD_W_SM + 8;
    const startX = LOGICAL_W / 2 - (communityCards.length * cardGap) / 2 + cardGap / 2;
    const boardY = LOGICAL_H * 0.43; // moved down toward the centre, clear of the top seat
    const winKeys = new Set((winningCards ?? []).map((c) => `${c.rank}${c.suit}`));
    const highlighting = winKeys.size > 0;
    communityCards.forEach((card, i) => {
      const card3d = drawCardFace(card, CARD_W_SM, CARD_H_SM);
      const x = startX + i * cardGap - CARD_W_SM / 2;
      let y = boardY - CARD_H_SM / 2;
      if (highlighting) {
        if (winKeys.has(`${card.rank}${card.suit}`)) {
          y -= 6;
          board.addChild(goldOutline(x, y, CARD_W_SM, CARD_H_SM));
        } else {
          card3d.alpha = 0.4;
        }
      }
      card3d.position.set(x, y);
      board.addChild(card3d);
    });
    if (communityCards.length === 0) {
      const style = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 16, fill: 0x9fe3bd, fontStyle: 'italic' });
      const t = new Text({ text: '— pre-flop —', style });
      t.anchor.set(0.5);
      t.position.set(LOGICAL_W / 2, boardY);
      board.addChild(t);
    }
    // NB: the board is added LAST (after seats) so the community cards always sit
    // on top — folded/mucked cards tossed toward the centre never cover them.

    // Pot badge
    const potG = new Graphics();
    const potLabel = new Text({
      text: `Pot: $${potTotal.toLocaleString()}`,
      style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 'bold', fill: theme.GOLD_BRIGHT }),
    });
    potLabel.anchor.set(0.5);
    const potW = Math.max(80, potLabel.width + 24);
    potG.roundRect(-potW / 2, -12, potW, 24, 12).fill({ color: 0x000000, alpha: 0.55 }).stroke({ width: 1, color: theme.GOLD, alpha: 0.5 });
    const potContainer = new Container();
    potContainer.addChild(potG, potLabel);
    potContainer.position.set(LOGICAL_W / 2, LOGICAL_H * POT_Y);
    scene.addChild(potContainer);

    const total = seats.length;
    const seatScale = seatScaleFor(total);
    // What a speech bubble keeps clear of: the board and pot above all, then the other seats.
    const centre = tableCentreRects(LOGICAL_W, LOGICAL_H, CARD_W_SM, CARD_H_SM);
    const seatRects = seats.map((s, i) => seatBoxRect(i, total, LOGICAL_W, LOGICAL_H, s.player.id === 'human' ? 1 : seatScale));
    seats.forEach((seat, idx) => {
      const pos = seatPosition(idx, total, LOGICAL_W, LOGICAL_H);
      // Folded players' cards are tossed onto the felt in front of them and stay
      // there (face-down) for the rest of the hand, instead of sitting in the box.
      if (seat.player.folded) {
        const { x: fx, y: fy } = foldedCardsSpot(idx, total, LOGICAL_W, LOGICAL_H, seatScale, CARD_W_SM, CARD_H_SM, centre.board);
        const fw = CARD_W_SM * 0.8 * seatScale;
        const fh = CARD_H_SM * 0.8 * seatScale;
        for (let i = 0; i < 2; i++) {
          const back = drawCardBack(fw, fh);
          back.position.set(fx - fw + i * 16 * seatScale, fy - fh / 2 + i * 5 * seatScale);
          back.rotation = (i === 0 ? -0.12 : 0.1);
          back.alpha = 0.85;
          scene.addChild(back);
        }
      }
      const otherSeats = seatRects.filter((_, i) => i !== idx);
      scene.addChild(buildSeatNode(seat, pos.x, pos.y, seatScale, otherSeats, [centre.board, centre.pot]));
      // Chips this player has put in the pot this street, between them and the centre.
      if (seat.player.streetContributed > 0) {
        const chips = drawChipStack(seat.player.streetContributed);
        const isHuman = seat.player.id === 'human';
        // Drawn box this frame: your seat grows a touch on your turn.
        const drawn = seatBoxRect(idx, total, LOGICAL_W, LOGICAL_H, isHuman ? (seat.isActing ? 1.12 : 1) : seatScale);
        const spot = betChipsSpot(idx, total, LOGICAL_W, LOGICAL_H, drawn, [...otherSeats, centre.board, centre.pot]);
        chips.position.set(spot.x, spot.y);
        scene.addChild(chips);
      }
    });

    // Community cards on top of everything else on the felt.
    scene.addChild(board);
  }

  function buildSeatNode(seat: SeatViewModel, x: number, y: number, seatScale = 1, obstacles: Rect[] = [], priority: Rect[] = []): Container {
    const c = new Container();
    c.position.set(x, y);
    const { player, isDealer, isSmallBlind, isBigBlind, isActing, isWinner, showCards, handLabel } = seat;
    const isHuman = player.id === 'human';
    // Opponents shrink on crowded tables; the human's seat stays full size so our
    // cards always match the community cards. On their turn, the human's whole
    // seat grows a touch; for opponents only their portrait grows.
    const base = isHuman ? 1 : seatScale;
    c.scale.set(isActing && isHuman ? base * 1.12 : base);
    if (player.folded) c.alpha = 0.5;

    const boxW = SEAT_BOX_W;
    const boxH = SEAT_BOX_H;

    // Active player gets a soft golden glow halo so it's obvious whose turn it is.
    if (isActing) {
      for (let i = 3; i >= 1; i--) {
        const glow = new Graphics();
        const pad = i * 7;
        glow
          .roundRect(-boxW / 2 - pad, -boxH / 2 - pad, boxW + pad * 2, boxH + pad * 2, 14 + pad)
          .fill({ color: theme.ACTING_RING, alpha: 0.08 });
        c.addChild(glow);
      }
    }

    // Mostly-transparent panel so chips and felt show through; only a border for
    // the active/winning seat plus a faint backing strip behind the text.
    const panel = new Graphics();
    const borderColor = isWinner ? theme.WINNER_GOLD : isActing ? theme.ACTING_RING : theme.SEAT_BORDER;
    panel.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 10).fill({ color: theme.SEAT_BG, alpha: 0.22 });
    if (isWinner || isActing) panel.stroke({ width: 2.5, color: borderColor });
    c.addChild(panel);

    const baseR = 30;
    const avatarCenterX = -boxW / 2 + 8 + baseR;
    const avatarCenterY = -boxH / 2 + 8 + baseR;
    // Opponent's portrait swells on their turn (their cards stay put).
    const drawR = isActing && !isHuman ? baseR * 1.45 : baseR;
    const avatar = drawAvatar(seat, drawR, isActing ? theme.ACTING_RING : 0x475569);
    avatar.position.set(avatarCenterX, avatarCenterY);
    c.addChild(avatar);

    // Name and stack stack vertically to the right of the (now larger) avatar.
    const textX = -boxW / 2 + 8 + baseR * 2 + 8;
    const nameStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 18, fontWeight: 'bold', fill: 0xe5e7eb });
    const nameText = new Text({ text: truncateName(player.name, 10), style: nameStyle });
    nameText.anchor.set(0, 0.5);
    nameText.position.set(textX, -boxH / 2 + 24);
    const maxNameWidth = boxW / 2 - textX - 6; // remaining width to the right edge
    if (nameText.width > maxNameWidth) nameText.scale.set(maxNameWidth / nameText.width, 1);
    c.addChild(nameText);

    const stackStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 17, fontWeight: 'bold', fill: 0x6ee7b7 });
    const stackText = new Text({ text: `$${player.stack.toLocaleString()}`, style: stackStyle });
    stackText.anchor.set(0, 0.5);
    stackText.position.set(textX, -boxH / 2 + 46);
    c.addChild(stackText);

    // Opponent note ("Calls a lot"...) under the stack — tap the seat for the full note.
    if (seat.note && !isHuman) {
      const color = NOTE_COLORS[seat.note.tone];
      const t = new Text({
        text: seat.note.text,
        style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: 'bold', fill: color }),
      });
      t.anchor.set(0, 0.5);
      const maxW = boxW / 2 - textX - 12;
      if (t.width > maxW) t.scale.set(maxW / t.width, 1);
      const pill = new Graphics();
      pill.roundRect(textX - 4, -boxH / 2 + 59, t.width + 8, 17, 8).fill({ color: 0x0b1220, alpha: 0.75 }).stroke({ width: 1, color, alpha: 0.6 });
      t.position.set(textX, -boxH / 2 + 67.5);
      c.addChild(pill, t);
    }
    if (!isHuman && onSeatClickRef.current) {
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => onSeatClickRef.current?.(player.id));
    }

    // Hole cards along the bottom. The human's are full size and side-by-side so
    // they're readable; opponents' are 30% smaller and overlapping (we only ever
    // see their backs) to free up table space.
    if (!player.folded) {
      const cardsContainer = new Container();
      const showFaces = isHuman || showCards;
      // Opponents' cards are drawn smaller and overlapping to save table space
      // — fine while they're face-down, but at showdown their faces ARE shown
      // and the overlap hid most of each card, making it impossible to read
      // what they actually held. Whenever faces are visible, spread them out
      // (and back off the size reduction) so both cards are fully legible.
      const shrink = isHuman ? 1 : showFaces ? 0.85 : 0.7;
      const cw = CARD_W_SM * shrink;
      const ch = CARD_H_SM * shrink;
      const gap = isHuman || showFaces ? cw + 6 : cw * 0.5;
      const cardY = boxH / 2 - ch - 8;
      const winHighlight = seat.isWinner && showFaces && (winningCards?.length ?? 0) > 0;
      const winSet = new Set((winningCards ?? []).map((c) => `${c.rank}${c.suit}`));
      for (let i = 0; i < 2; i++) {
        const card = player.holeCards[i];
        const node = showFaces && card ? drawCardFace(card, cw, ch) : drawCardBack(cw, ch);
        const x = (i === 0 ? -gap / 2 : gap / 2) - cw / 2;
        // On the winning seat, mark which hole cards were part of the winning
        // five; a dimmed card didn't play (both dimmed = the board won it).
        if (winHighlight && card) {
          if (winSet.has(`${card.rank}${card.suit}`)) cardsContainer.addChild(goldOutline(x, cardY, cw, ch));
          else node.alpha = 0.45;
        }
        node.position.set(x, cardY);
        cardsContainer.addChild(node);
      }
      c.addChild(cardsContainer);
    }

    // The player's own chip pile (sized to their stack), tucked into the lower-right
    // of the seat where the cards never reach — chips are never drawn over cards.
    if (player.stack > 0) {
      const pile = drawChipStack(player.stack, false); // no $ label — the stack text already shows it
      pile.scale.set(0.55);
      pile.position.set(boxW / 2 - 12, boxH / 2 - 14);
      c.addChild(pile);
    }

    // Badges
    let badgeX = boxW / 2 - 10;
    const badgeY = -boxH / 2 - 4;
    if (isBigBlind) {
      const b = drawBadge('BB', 0xf43f5e);
      b.position.set(badgeX, badgeY);
      c.addChild(b);
      badgeX -= 20;
    }
    if (isSmallBlind) {
      const b = drawBadge('SB', 0x38bdf8);
      b.position.set(badgeX, badgeY);
      c.addChild(b);
      badgeX -= 20;
    }
    if (isDealer) {
      const b = drawBadge('D', 0xffffff);
      b.position.set(badgeX, badgeY);
      c.addChild(b);
    }

    if (player.folded || handLabel) {
      const label = player.folded ? 'FOLDED' : handLabel!;
      const color = player.folded ? 0xcbd5e1 : theme.GOLD_BRIGHT;
      const t = new Text({
        text: label,
        style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: 'bold', fill: color, letterSpacing: 1 }),
      });
      t.anchor.set(0.5);
      const pillW = t.width + 16;
      const pill = new Graphics();
      pill.roundRect(-pillW / 2, boxH / 2 - 22, pillW, 18, 9).fill({ color: 0x0b1220, alpha: 0.8 });
      c.addChild(pill);
      t.position.set(0, boxH / 2 - 13);
      c.addChild(t);
    }

    // What this player just did, above the seat. Colour-coded so aggression is
    // readable at a glance: red-ish for a raise/all-in, green for a call,
    // grey for a check.
    if (seat.lastAction && !player.folded && !handLabel) {
      const a = seat.lastAction;
      const tone = a.startsWith('Raise') || a.startsWith('All in') || a.startsWith('Bet')
        ? 0xfca5a5
        : a.startsWith('Call')
          ? 0x86efac
          : 0xcbd5e1;
      const t = new Text({
        text: a.toUpperCase(),
        style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: 'bold', fill: tone, letterSpacing: 0.5 }),
      });
      t.anchor.set(0.5);
      const pillW = t.width + 14;
      // Reuses the bottom-centre pill slot that FOLDED / the hand rank occupy.
      // Those only appear when the player is out or at showdown, and this label
      // is gated off in both cases, so the three can never collide — whereas
      // the seat's top edge is already taken by the name, the dealer/blind
      // badges and the speech bubble.
      const pill = new Graphics();
      pill.roundRect(-pillW / 2, boxH / 2 - 22, pillW, 18, 9).fill({ color: 0x0b1220, alpha: 0.85 });
      c.addChild(pill);
      t.position.set(0, boxH / 2 - 13);
      c.addChild(t);
    }

    if (seat.speech) {
      // Bumped from 11px/130px-wrap — table chatter was too small to read
      // comfortably at normal viewing distance.
      const bubbleStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 15, fontStyle: 'italic', fill: 0x0b0b0b, wordWrap: true, wordWrapWidth: 190 });
      const bubbleText = new Text({ text: seat.speech, style: bubbleStyle });
      bubbleText.anchor.set(0.5);
      const bubbleW = Math.min(215, bubbleText.width + 22);
      const bubbleH = bubbleText.height + 16;
      // Above the seat when there's room, otherwise beside it (see chooseBubbleSide).
      const sc = c.scale.x;
      const side = chooseBubbleSide(
        { x: x - (boxW * sc) / 2, y: y - (boxH * sc) / 2, w: boxW * sc, h: boxH * sc },
        bubbleW * sc,
        bubbleH * sc,
        obstacles,
        LOGICAL_W,
        LOGICAL_H,
        priority,
      );
      const gap = BUBBLE_GAP / sc;
      // Top-left of the bubble in seat-local units, matching bubbleRect().
      const bx = side === 'above' ? -bubbleW / 2 : side === 'right' ? boxW / 2 + gap : -boxW / 2 - gap - bubbleW;
      const by = side === 'above' ? -boxH / 2 - gap - bubbleH : -boxH / 2 + 6 / sc;
      const fill = { color: 0xfef9c3, alpha: 0.95 };
      const bubble = new Graphics();
      bubble.roundRect(bx, by, bubbleW, bubbleH, 8).fill(fill).stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      // The tail points back at the speaker.
      if (side === 'above') {
        bubble.moveTo(-6, by + bubbleH - 1).lineTo(6, by + bubbleH - 1).lineTo(0, by + bubbleH + 8).closePath().fill(fill);
      } else {
        const edge = side === 'right' ? bx + 1 : bx + bubbleW - 1;
        const tip = side === 'right' ? bx - 8 : bx + bubbleW + 8;
        const midY = by + Math.min(bubbleH / 2, 18);
        bubble.moveTo(edge, midY - 6).lineTo(edge, midY + 6).lineTo(tip, midY).closePath().fill(fill);
      }
      bubbleText.position.set(bx + bubbleW / 2, by + bubbleH / 2);
      c.addChild(bubble, bubbleText);
    }

    return c;
  }

  // Top-left positions of a seat's two hole cards (matches buildSeatNode layout).
  function holeCardCorners(seatX: number, seatY: number): Array<{ x: number; y: number }> {
    const gap = CARD_W_SM + 6;
    return [
      { x: seatX - gap / 2 - CARD_W_SM / 2, y: seatY + SEAT_CARD_TOP },
      { x: seatX + gap / 2 - CARD_W_SM / 2, y: seatY + SEAT_CARD_TOP },
    ];
  }

  // Tween a display object from one point to another over the overlay layer.
  function tween(
    obj: Container,
    from: { x: number; y: number },
    to: { x: number; y: number },
    opts: { delayMs?: number; durMs: number; fadeOut?: boolean; onDone?: () => void },
  ) {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.addChild(obj);
    obj.position.set(from.x, from.y);
    obj.alpha = opts.delayMs ? 0 : 1;
    const start = performance.now() + (opts.delayMs ?? 0);
    animationsRef.current.push((now) => {
      if (now < start) return false;
      const t = Math.min(1, (now - start) / opts.durMs);
      const e = easeOutCubic(t);
      obj.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      obj.alpha = opts.fadeOut ? 1 - t : 1;
      if (t >= 1) {
        overlay.removeChild(obj);
        obj.destroy({ children: true });
        opts.onDone?.();
        return true;
      }
      return false;
    });
  }

  // (5) Deal: flick a card-back from the dealer's seat to every seat's hole
  // slots, staggered around the table, then let the real cards show underneath.
  function animateDeal() {
    const total = seats.length;
    const dealerIdx = Math.max(0, seats.findIndex((s) => s.isDealer));
    const dealerPos = seatPosition(dealerIdx, total, LOGICAL_W, LOGICAL_H);
    const origin = { x: dealerPos.x, y: dealerPos.y };
    let order = 0;
    seats.forEach((seat, idx) => {
      if (seat.player.holeCards.length === 0 && !seat.showCards && seat.player.folded) return;
      const pos = seatPosition(idx, total, LOGICAL_W, LOGICAL_H);
      holeCardCorners(pos.x, pos.y).forEach((corner) => {
        const card = drawCardBack(CARD_W_SM, CARD_H_SM);
        tween(card, origin, corner, { delayMs: order * 90, durMs: 280 });
        order++;
      });
    });
  }

  // (4) Fold-to-muck: toss the folding player's cards into the felt just in
  // front of them (partway toward the centre), then fade out.
  function animateMuck(seatIdx: number) {
    const total = seats.length;
    const pos = seatPosition(seatIdx, total, LOGICAL_W, LOGICAL_H);
    // Land where the folded cards then rest (in front of the seat, or beside it
    // for seats across the top, so they never cover the board).
    const scale = seatScaleFor(total);
    const { board } = tableCentreRects(LOGICAL_W, LOGICAL_H, CARD_W_SM, CARD_H_SM);
    const spot = foldedCardsSpot(seatIdx, total, LOGICAL_W, LOGICAL_H, scale, CARD_W_SM, CARD_H_SM, board);
    holeCardCorners(pos.x, pos.y).forEach((corner, i) => {
      const card = drawCardBack(CARD_W_SM, CARD_H_SM);
      tween(card, corner, { x: spot.x - CARD_W_SM / 2 + i * 10, y: spot.y - CARD_H_SM / 2 + i * 4 }, { durMs: 480, fadeOut: true });
    });
  }

  // (6) Pot award: send chip stacks from the centre pot to each winner.
  function animateWin(ids: string[]) {
    const total = seats.length;
    const center = { x: LOGICAL_W / 2, y: LOGICAL_H * 0.52 };
    ids.forEach((id) => {
      const idx = seats.findIndex((s) => s.player.id === id);
      if (idx < 0) return;
      const pos = seatPosition(idx, total, LOGICAL_W, LOGICAL_H);
      for (let i = 0; i < 3; i++) {
        const chips = drawChipStack(0);
        // drawChipStack labels with the amount; we just want tokens, so hide the label child.
        const label = chips.children[chips.children.length - 1];
        if (label) label.visible = false;
        tween(chips, { x: center.x + (i - 1) * 10, y: center.y }, { x: pos.x, y: pos.y }, { delayMs: i * 80, durMs: 480, fadeOut: true });
      }
    });
  }

  // Trigger the deal animation once per new hand.
  useEffect(() => {
    if (handNumber == null || handNumber === lastDealtHandRef.current) return;
    lastDealtHandRef.current = handNumber;
    if (overlayRef.current) animateDeal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handNumber]);

  // Trigger a muck animation for any seat that just folded.
  useEffect(() => {
    const nowFolded = new Set(seats.filter((s) => s.player.folded).map((s) => s.player.id));
    seats.forEach((seat, idx) => {
      if (seat.player.folded && !prevFoldedRef.current.has(seat.player.id)) {
        if (overlayRef.current) animateMuck(idx);
      }
    });
    prevFoldedRef.current = nowFolded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  // Trigger the chip-award animation once per hand when winners are known.
  useEffect(() => {
    if (!winnerIds || winnerIds.length === 0) return;
    if (handNumber === lastWinHandRef.current) return;
    lastWinHandRef.current = handNumber;
    if (overlayRef.current) animateWin(winnerIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerIds, handNumber]);

  // Load any not-yet-cached portrait textures, then redraw so the photos
  // replace the fallback faces. Failures are cached as null (drawn face stays).
  useEffect(() => {
    const urls = Array.from(new Set(seats.map((s) => s.portrait).filter((u): u is string => !!u)));
    const missing = urls.filter((u) => !portraitCache.current.has(u));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (url) => {
        try {
          const tex = await Assets.load<Texture>(url);
          portraitCache.current.set(url, tex);
        } catch {
          portraitCache.current.set(url, null);
        }
      }),
    ).then(() => {
      if (cancelled) return;
      try {
        renderScene();
      } catch (err) {
        console.error('PokerCanvas render error', err);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  useEffect(() => {
    // A draw error must never crash the React tree (and white-screen the game);
    // worst case the canvas skips a frame and redraws on the next state change.
    try {
      renderScene();
    } catch (err) {
      console.error('PokerCanvas render error', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats, communityCards, potTotal, width, height, winningCards]);

  return <div ref={hostRef} style={{ width, height }} />;
}

function goldOutline(x: number, y: number, w: number, h: number): Graphics {
  const g = new Graphics();
  g.roundRect(x - 3, y - 3, w + 6, h + 6, 8).fill({ color: theme.WINNER_GOLD, alpha: 0.35 }).stroke({ width: 2.5, color: theme.WINNER_GOLD });
  return g;
}
