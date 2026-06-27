import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { Card } from '../engine/deck';
import type { HandPlayer } from '../engine/game';
import * as theme from './theme';
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
  speech?: string;
  portrait?: string;
}

export interface PokerCanvasProps {
  seats: SeatViewModel[];
  communityCards: Card[];
  potTotal: number;
  /** Increments each new hand; triggers the deal animation. */
  handNumber?: number;
  /** IDs of seats that won the pot; triggers the chip-award animation. */
  winnerIds?: string[];
  width?: number;
  height?: number;
}

function truncateName(name: string, max = 8): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function seatPosition(index: number, total: number, w: number, h: number) {
  const theta = (index / total) * 2 * Math.PI;
  // Vertical spread kept tight enough that the tall seat boxes at the top and
  // bottom of the oval stay fully on-canvas (heads no longer clipped).
  const x = w / 2 + (w * 0.41) * Math.sin(theta);
  const y = h / 2 + (h * 0.33) * Math.cos(theta);
  const chipX = x + (w / 2 - x) * 0.32;
  const chipY = y + (h / 2 - y) * 0.32;
  return { x, y, chipX, chipY };
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
const SEAT_BOX_W = 172;
const SEAT_BOX_H = 158;
const SEAT_CARD_TOP = SEAT_BOX_H / 2 - CARD_H_SM - 8; // top-left y of hole cards within a seat box

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function PokerCanvas({ seats, communityCards, potTotal, handNumber, winnerIds, width = LOGICAL_W, height = LOGICAL_H }: PokerCanvasProps) {
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
    communityCards.forEach((card, i) => {
      const card3d = drawCardFace(card, CARD_W_SM, CARD_H_SM);
      card3d.position.set(startX + i * cardGap - CARD_W_SM / 2, LOGICAL_H * 0.36 - CARD_H_SM / 2);
      board.addChild(card3d);
    });
    if (communityCards.length === 0) {
      const style = new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 14, fill: 0x9fe3bd, fontStyle: 'italic' });
      const t = new Text({ text: '— pre-flop —', style });
      t.anchor.set(0.5);
      t.position.set(LOGICAL_W / 2, LOGICAL_H * 0.38);
      board.addChild(t);
    }
    scene.addChild(board);

    // Pot badge
    const potG = new Graphics();
    const potLabel = new Text({
      text: `Pot: ${potTotal}`,
      style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 'bold', fill: theme.GOLD_BRIGHT }),
    });
    potLabel.anchor.set(0.5);
    const potW = Math.max(80, potLabel.width + 24);
    potG.roundRect(-potW / 2, -12, potW, 24, 12).fill({ color: 0x000000, alpha: 0.55 }).stroke({ width: 1, color: theme.GOLD, alpha: 0.5 });
    const potContainer = new Container();
    potContainer.addChild(potG, potLabel);
    potContainer.position.set(LOGICAL_W / 2, LOGICAL_H * 0.52);
    scene.addChild(potContainer);

    const total = seats.length;
    seats.forEach((seat, idx) => {
      const pos = seatPosition(idx, total, LOGICAL_W, LOGICAL_H);
      // Each player's own chip pile, sized to their stack, sits just outside
      // their seat (toward the rail) so you can read everyone's relative stack.
      if (seat.player.stack > 0) {
        const ox = pos.x + (pos.x - LOGICAL_W / 2) * 0.12;
        const oy = pos.y + (pos.y - LOGICAL_H / 2) * 0.12 + (pos.y < LOGICAL_H / 2 ? -SEAT_BOX_H / 2 - 8 : SEAT_BOX_H / 2 + 22);
        const pile = drawChipStack(seat.player.stack);
        pile.position.set(ox, oy);
        scene.addChild(pile);
      }
      scene.addChild(buildSeatNode(seat, pos.x, pos.y));
      // Chips this player has put in the pot this street, between them and the centre.
      if (seat.player.streetContributed > 0) {
        const chips = drawChipStack(seat.player.streetContributed);
        chips.position.set(pos.chipX, pos.chipY);
        scene.addChild(chips);
      }
    });
  }

  function buildSeatNode(seat: SeatViewModel, x: number, y: number): Container {
    const c = new Container();
    c.position.set(x, y);
    const { player, isDealer, isSmallBlind, isBigBlind, isActing, isWinner, showCards, handLabel } = seat;

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

    const panel = new Graphics();
    const borderColor = isWinner ? theme.WINNER_GOLD : isActing ? theme.ACTING_RING : theme.SEAT_BORDER;
    const borderWidth = isWinner || isActing ? 2.5 : 1;
    panel.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 10).fill({ color: theme.SEAT_BG, alpha: 0.85 }).stroke({ width: borderWidth, color: borderColor });
    if (player.folded) panel.alpha = 0.45;
    c.addChild(panel);

    const avatarRadius = 30;
    const avatar = drawAvatar(seat, avatarRadius, isActing ? theme.ACTING_RING : 0x475569);
    avatar.position.set(-boxW / 2 + 8 + avatarRadius, -boxH / 2 + 8 + avatarRadius);
    c.addChild(avatar);

    // Name and stack stack vertically to the right of the (now larger) avatar.
    const textX = -boxW / 2 + 8 + avatarRadius * 2 + 8;
    const nameStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 'bold', fill: 0xe5e7eb });
    const nameText = new Text({ text: truncateName(player.name, 10), style: nameStyle });
    nameText.anchor.set(0, 0.5);
    nameText.position.set(textX, -boxH / 2 + 22);
    const maxNameWidth = boxW / 2 - textX - 6; // remaining width to the right edge
    if (nameText.width > maxNameWidth) nameText.scale.set(maxNameWidth / nameText.width, 1);
    c.addChild(nameText);

    const stackStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', fill: 0x6ee7b7 });
    const stackText = new Text({ text: String(player.stack), style: stackStyle });
    stackText.anchor.set(0, 0.5);
    stackText.position.set(textX, -boxH / 2 + 42);
    c.addChild(stackText);

    // Hole cards, centered along the bottom of the box.
    const cardsContainer = new Container();
    const gap = CARD_W_SM + 6;
    const cardY = SEAT_CARD_TOP;
    if (player.holeCards.length === 0) {
      const back1 = drawCardBack(CARD_W_SM, CARD_H_SM);
      const back2 = drawCardBack(CARD_W_SM, CARD_H_SM);
      back1.position.set(-gap / 2 - CARD_W_SM / 2, cardY);
      back2.position.set(gap / 2 - CARD_W_SM / 2, cardY);
      cardsContainer.addChild(back1, back2);
    } else {
      player.holeCards.forEach((card, i) => {
        const node = showCards ? drawCardFace(card, CARD_W_SM, CARD_H_SM) : drawCardBack(CARD_W_SM, CARD_H_SM);
        node.position.set((i === 0 ? -gap / 2 : gap / 2) - CARD_W_SM / 2, cardY);
        cardsContainer.addChild(node);
      });
    }
    c.addChild(cardsContainer);

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

    if (seat.speech) {
      const bubbleStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fontStyle: 'italic', fill: 0x0b0b0b, wordWrap: true, wordWrapWidth: 130 });
      const bubbleText = new Text({ text: seat.speech, style: bubbleStyle });
      bubbleText.anchor.set(0.5);
      const bubbleW = Math.min(150, bubbleText.width + 18);
      const bubbleH = bubbleText.height + 14;
      const bubble = new Graphics();
      bubble
        .roundRect(-bubbleW / 2, -bubbleH, bubbleW, bubbleH, 8)
        .fill({ color: 0xfef9c3, alpha: 0.95 })
        .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      bubble.moveTo(-6, -2).lineTo(6, -2).lineTo(0, 8).fill({ color: 0xfef9c3, alpha: 0.95 }).closePath();
      const bubbleContainer = new Container();
      bubbleContainer.addChild(bubble);
      bubbleText.position.set(0, -bubbleH / 2);
      bubbleContainer.addChild(bubbleText);
      bubbleContainer.position.set(0, -boxH / 2 - 14);
      c.addChild(bubbleContainer);
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
    // 45% of the way from the seat toward the table centre.
    const tossX = pos.x + (LOGICAL_W / 2 - pos.x) * 0.45;
    const tossY = pos.y + (LOGICAL_H / 2 - pos.y) * 0.45;
    holeCardCorners(pos.x, pos.y).forEach((corner, i) => {
      const card = drawCardBack(CARD_W_SM, CARD_H_SM);
      tween(card, corner, { x: tossX - CARD_W_SM / 2 + i * 10, y: tossY - CARD_H_SM / 2 + i * 4 }, { durMs: 480, fadeOut: true });
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
  }, [seats, communityCards, potTotal, width, height]);

  return <div ref={hostRef} style={{ width, height }} />;
}
