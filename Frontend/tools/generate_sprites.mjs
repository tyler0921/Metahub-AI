#!/usr/bin/env node
/**
 * 메타버스 오피스 스프라이트 생성기 (Node.js / @napi-rs/canvas).
 *
 * 캐릭터·타일·가구 PNG 3장과 manifest.json 을 생성합니다.
 *
 * 실행:
 *   node Frontend/tools/generate_sprites.mjs
 *
 * 출력:
 *   Frontend/public/sprites/characters.png
 *   Frontend/public/sprites/tiles.png
 *   Frontend/public/sprites/props.png
 *   Frontend/public/sprites/manifest.json
 */

import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 규격 ────────────────────────────────────────────────
const TILE = 32;
const CHAR_W = 32;
const CHAR_H = 48;
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const FRAMES = 4;

const OUT_DIR = join(__dirname, '..', 'public', 'sprites');

// ── 색 유틸 ─────────────────────────────────────────────
/** @param {string} value @returns {[number, number, number]} */
function hexRgb(value) {
  const v = value.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** @param {[number, number, number]} color @param {number} amount @returns {[number, number, number]} */
function shade(color, amount) {
  return color.map((c) => Math.max(0, Math.min(255, c + amount)));
}

/** @param {[number, number, number]} a @param {[number, number, number]} b @param {number} t @returns {[number, number, number]} */
function mix(a, b, t) {
  return a.map((x, i) => Math.round(x + (b[i] - x) * t));
}

/** @param {number} r @param {number} g @param {number} b @param {number} [a=255] */
function rgbaStr(r, g, b, a = 255) {
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

/** @param {number[]|[number, number, number]} c @param {number} [a] */
function toFill(c, a) {
  if (typeof c === 'string') return c;
  if (c.length === 4 || a !== undefined) {
    const [r, g, b, alpha = a ?? 255] = c.length === 4 ? c : [...c, a ?? 255];
    return rgbaStr(r, g, b, alpha);
  }
  const [r, g, b] = c;
  return `rgb(${r}, ${g}, ${b})`;
}

// ── Canvas 드로잉 헬퍼 (PIL inclusive 좌표 호환) ─────────
/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx */
function rect(ctx, x0, y0, x1, y1, fill) {
  ctx.fillStyle = toFill(fill);
  ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx */
function line(ctx, x0, y0, x1, y1, fill, width = 1) {
  ctx.strokeStyle = toFill(fill);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx */
function ellipse(ctx, x0, y0, x1, y1, fill) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = toFill(fill);
  ctx.fill();
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx */
function roundedRect(ctx, x0, y0, x1, y1, radius, fill, outline, outlineWidth = 1) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, radius);
  ctx.fillStyle = toFill(fill);
  ctx.fill();
  if (outline !== undefined) {
    ctx.strokeStyle = toFill(outline);
    ctx.lineWidth = outlineWidth;
    ctx.stroke();
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx @param {[number, number][]} points */
function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
  ctx.fillStyle = toFill(fill);
  ctx.fill();
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} ctx */
function point(ctx, x, y, fill) {
  ctx.fillStyle = toFill(fill);
  ctx.fillRect(x, y, 1, 1);
}

// ── 캐릭터 정의 ─────────────────────────────────────────
const CHARACTERS = [
  ['ceo', '#26354a', '#252a35', '#f2cba3'],
  ['chief', '#d99b2b', '#6f4128', '#f0c9a0'],
  ['planner', '#367cae', '#252a35', '#e8bd94'],
  ['researcher', '#8056a8', '#35283d', '#f3d0ab'],
  ['marketer', '#d66767', '#7b3f32', '#f0c9a0'],
  ['dev', '#178f88', '#242936', '#e0b088'],
  ['finance', '#31577f', '#273247', '#f2cba3'],
  ['writer', '#d8802f', '#6d4329', '#f5d5b0'],
];

const TROUSERS = hexRgb('#39404f');
const SHOES = hexRgb('#22262f');
const OUTLINE = hexRgb('#1a1d24');

/**
 * 32×48 칸 하나에 캐릭터 한 포즈를 그립니다.
 *
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} ox
 * @param {number} oy
 * @param {[number, number, number]} shirt
 * @param {[number, number, number]} hair
 * @param {[number, number, number]} skin
 * @param {string} direction
 * @param {number} frame
 */
function drawCharacter(ctx, ox, oy, shirt, hair, skin, direction, frame, role) {
  const swing = { 0: 0, 1: 2, 2: 0, 3: -2 }[frame];
  const sideView = direction === 'left' || direction === 'right';
  const facing = direction === 'left' ? -1 : 1;

  const cx = ox + 16;
  const headTop = oy + 7;
  const headBottom = oy + 21;
  const halfW = sideView ? 5 : 7;

  ellipse(ctx, cx - 8, oy + 42, cx + 8, oy + 47, [0, 0, 0, 70]);

  if (sideView) {
    for (const [depth, lift] of [
      [0, -swing],
      [1, swing],
    ]) {
      const lx = cx - 3 + depth * 2;
      const leg = depth ? TROUSERS : shade(TROUSERS, -18);
      rect(ctx, lx, oy + 33, lx + 4, oy + 42 + lift, leg);
      rect(
        ctx,
        lx - (facing < 0 ? 2 : 0),
        oy + 42 + lift,
        lx + 4 + (facing > 0 ? 2 : 0),
        oy + 45 + lift,
        depth ? SHOES : shade(SHOES, -14),
      );
    }
  } else {
    for (const sign of [-1, 1]) {
      const lift = sign < 0 ? swing : -swing;
      const lx = cx + sign * 4;
      rect(ctx, lx - 3, oy + 33, lx + 2, oy + 42 + lift, TROUSERS);
      rect(ctx, lx - 3, oy + 42 + lift, lx + 2, oy + 45 + lift, SHOES);
    }
  }

  const bodyTop = oy + 22;
  rect(ctx, cx - halfW, bodyTop, cx + halfW - 1, oy + 35, shirt);
  rect(ctx, cx - halfW, oy + 32, cx + halfW - 1, oy + 35, shade(shirt, -24));
  rect(ctx, cx - halfW, bodyTop, cx + halfW - 1, bodyTop + 2, shade(shirt, 18));

  if (direction === 'down') {
    rect(ctx, cx - 2, bodyTop, cx + 1, bodyTop + 3, shade(shirt, -30));
  } else if (direction === 'up') {
    line(ctx, cx, bodyTop + 1, cx, oy + 34, shade(shirt, -16));
  }

  if (sideView) {
    const ax = cx + facing * 3;
    rect(ctx, ax - 2, oy + 23, ax + 2, oy + 32 + swing, shade(shirt, -14));
    rect(ctx, ax - 2, oy + 32 + swing, ax + 2, oy + 35 + swing, skin);
  } else {
    for (const sign of [-1, 1]) {
      const offset = sign < 0 ? -swing : swing;
      const ax = cx + sign * 8;
      rect(ctx, ax - 1, oy + 23, ax + 1, oy + 32 + offset, shade(shirt, -12));
      rect(ctx, ax - 1, oy + 32 + offset, ax + 1, oy + 34 + offset, skin);
    }
  }

  rect(ctx, cx - 2, oy + 20, cx + 1, oy + 23, shade(skin, -28));

  if (sideView) {
    const hx0 = cx - 5 + facing;
    const hx1 = cx + 5 + facing;
    rect(ctx, hx0, headTop, hx1, headBottom, skin);
    rect(ctx, hx0, headBottom - 2, hx1, headBottom, shade(skin, -18));
    const noseX = facing < 0 ? hx0 - 1 : hx1 + 1;
    rect(ctx, noseX, oy + 15, noseX, oy + 17, shade(skin, -26));
    rect(ctx, hx0, headTop - 1, hx1, headTop + 4, hair);
    if (facing < 0) {
      rect(ctx, hx1 - 3, headTop - 1, hx1, oy + 19, hair);
    } else {
      rect(ctx, hx0, headTop - 1, hx0 + 3, oy + 19, hair);
    }
    const earX = cx + (facing < 0 ? 2 : -3);
    rect(ctx, earX, oy + 15, earX + 1, oy + 17, shade(skin, -22));
    const eyeX = facing < 0 ? hx0 + 1 : hx1 - 2;
    rect(ctx, eyeX, oy + 15, eyeX + 1, oy + 17, OUTLINE);
  } else if (direction === 'up') {
    rect(ctx, cx - 7, headTop - 1, cx + 6, headBottom, hair);
    rect(ctx, cx - 7, headBottom - 2, cx + 6, headBottom, shade(hair, -18));
    rect(ctx, cx - 5, headTop, cx + 4, headTop + 2, shade(hair, 22));
  } else {
    rect(ctx, cx - 7, headTop, cx + 6, headBottom, skin);
    rect(ctx, cx - 7, headBottom - 2, cx + 6, headBottom, shade(skin, -18));
    rect(ctx, cx - 7, headTop - 1, cx + 6, headTop + 4, hair);
    rect(ctx, cx - 7, headTop - 1, cx - 4, oy + 15, hair);
    rect(ctx, cx + 3, headTop - 1, cx + 6, oy + 15, hair);
    rect(ctx, cx - 5, oy + 15, cx - 4, oy + 17, OUTLINE);
    rect(ctx, cx + 3, oy + 15, cx + 4, oy + 17, OUTLINE);
    rect(ctx, cx - 1, oy + 18, cx, oy + 18, shade(skin, -40));
  }

  // 색만으로 직원을 구분하지 않습니다. 작은 화면에서도 역할이 읽히도록
  // 안경·헤드셋·후드·넥타이처럼 실루엣이 다른 1~2px 표식을 둡니다.
  if (direction === 'down') {
    if (role === 'ceo') {
      line(ctx, cx - 5, bodyTop + 2, cx - 1, bodyTop + 7, [232, 228, 216]);
      line(ctx, cx + 4, bodyTop + 2, cx, bodyTop + 7, [232, 228, 216]);
    }
    if (role === 'researcher' || role === 'dev') {
      const glass = role === 'researcher' ? [119, 76, 163] : [23, 143, 136];
      ctx.strokeStyle = toFill(glass);
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 6.5, oy + 14.5, 5, 4);
      ctx.strokeRect(cx + 1.5, oy + 14.5, 5, 4);
      line(ctx, cx - 1, oy + 16, cx + 1, oy + 16, glass);
    }
    if (role === 'marketer') {
      line(ctx, cx - 8, oy + 11, cx - 8, oy + 20, OUTLINE, 2);
      line(ctx, cx + 7, oy + 11, cx + 7, oy + 20, OUTLINE, 2);
      line(ctx, cx + 7, oy + 19, cx + 4, oy + 22, OUTLINE);
    }
    if (role === 'dev') {
      line(ctx, cx - 5, bodyTop + 1, cx, bodyTop + 5, shade(shirt, 26));
      line(ctx, cx + 4, bodyTop + 1, cx, bodyTop + 5, shade(shirt, 26));
    }
    if (role === 'finance') {
      polygon(ctx, [[cx - 1, bodyTop + 2], [cx + 1, bodyTop + 2], [cx + 2, bodyTop + 9], [cx, bodyTop + 11], [cx - 2, bodyTop + 9]], [215, 157, 63]);
    }
    if (role === 'writer') {
      ellipse(ctx, cx + 2, headTop - 5, cx + 8, headTop + 1, hair);
      rect(ctx, cx + 4, headTop - 6, cx + 6, headTop - 4, [217, 155, 43]);
    }
  }
}

function buildCharacters() {
  const cols = DIRECTIONS.length * FRAMES;
  const rows = CHARACTERS.length;
  const canvas = createCanvas(cols * CHAR_W, rows * CHAR_H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /** @type {Record<string, number>} */
  const index = {};
  for (let row = 0; row < CHARACTERS.length; row++) {
    const [charId, shirtHex, hairHex, skinHex] = CHARACTERS[row];
    index[charId] = row;
    const shirt = hexRgb(shirtHex);
    const hair = hexRgb(hairHex);
    const skin = hexRgb(skinHex);

    for (let d = 0; d < DIRECTIONS.length; d++) {
      const direction = DIRECTIONS[d];
      for (let frame = 0; frame < FRAMES; frame++) {
        const col = d * FRAMES + frame;
        drawCharacter(ctx, col * CHAR_W, row * CHAR_H, shirt, hair, skin, direction, frame, charId);
      }
    }
  }

  const meta = {
    frameWidth: CHAR_W,
    frameHeight: CHAR_H,
    directions: DIRECTIONS,
    frames: FRAMES,
    rows: index,
  };
  return { canvas, meta };
}

// ── 타일 ────────────────────────────────────────────────
const TILE_NAMES = [
  'floor_wood',
  'floor_tile',
  'carpet',
  'wall_face',
  'wall_top',
  'rug_edge',
  'glass',
];

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawFloorWood(d, ox, oy) {
  const base = hexRgb('#c99a69');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  for (const y of [0, 16]) {
    line(d, ox, oy + y, ox + TILE - 1, oy + y, shade(base, -13));
  }
  for (const [y, tone] of [
    [4, -5],
    [9, 4],
    [20, -5],
    [26, 4],
  ]) {
    line(d, ox + 2, oy + y, ox + TILE - 3, oy + y, shade(base, tone));
  }
  line(d, ox + 20, oy, ox + 20, oy + 15, shade(base, -16));
  line(d, ox + 8, oy + 16, ox + 8, oy + TILE - 1, shade(base, -16));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawFloorTile(d, ox, oy) {
  const base = hexRgb('#c9d1dc');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  const grain = shade(base, -8);
  for (let i = 0; i < TILE; i += 8) {
    line(d, ox + i, oy, ox + i + 7, oy + 7, grain);
    line(d, ox + i, oy + 16, ox + i + 7, oy + 23, grain);
    line(d, ox + i + 7, oy + 8, ox + i, oy + 15, grain);
    line(d, ox + i + 7, oy + 24, ox + i, oy + 31, grain);
  }
  d.strokeStyle = toFill(shade(base, -12));
  d.lineWidth = 1;
  d.strokeRect(ox + 0.5, oy + 0.5, TILE - 1, TILE - 1);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawCarpet(d, ox, oy) {
  const base = [224, 218, 205];
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  for (let y = 0; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x += 4) {
      if ((x + y) % 8 === 0) {
        point(d, ox + x, oy + y, [236, 236, 236]);
      }
    }
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawRugEdge(d, ox, oy) {
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, [224, 218, 205]);
  d.strokeStyle = toFill([184, 171, 151]);
  d.lineWidth = 1;
  d.strokeRect(ox, oy, TILE, TILE);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawWallFace(d, ox, oy) {
  const base = hexRgb('#303a4c');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  rect(d, ox, oy, ox + TILE - 1, oy + 2, shade(base, -18));
  rect(d, ox, oy + TILE - 5, ox + TILE - 1, oy + TILE - 1, hexRgb('#202837'));
  rect(d, ox, oy + TILE - 2, ox + TILE - 1, oy + TILE - 1, hexRgb('#151b26'));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawWallTop(d, ox, oy) {
  const base = hexRgb('#465166');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  rect(d, ox, oy, ox + TILE - 1, oy + 1, shade(base, 16));
  rect(d, ox, oy + TILE - 2, ox + TILE - 1, oy + TILE - 1, shade(base, -20));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawGlass(d, ox, oy) {
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, [178, 214, 233, 130]);
  rect(d, ox, oy, ox + TILE - 1, oy + 2, hexRgb('#9fb6c6'));
  rect(d, ox, oy + TILE - 3, ox + TILE - 1, oy + TILE - 1, hexRgb('#9fb6c6'));
  line(d, ox + 6, oy + 4, ox + 2, oy + TILE - 5, [255, 255, 255, 150], 2);
  line(d, ox + 18, oy + 4, ox + 14, oy + TILE - 5, [255, 255, 255, 110], 2);
}

const TILE_DRAWERS = {
  floor_wood: drawFloorWood,
  floor_tile: drawFloorTile,
  carpet: drawCarpet,
  wall_face: drawWallFace,
  wall_top: drawWallTop,
  rug_edge: drawRugEdge,
  glass: drawGlass,
};

function buildTiles() {
  const canvas = createCanvas(TILE * TILE_NAMES.length, TILE);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /** @type {Record<string, { x: number, y: number, w: number, h: number }>} */
  const index = {};
  for (let i = 0; i < TILE_NAMES.length; i++) {
    const name = TILE_NAMES[i];
    TILE_DRAWERS[name](ctx, i * TILE, 0);
    index[name] = { x: i * TILE, y: 0, w: TILE, h: TILE };
  }
  return { canvas, meta: { tileSize: TILE, tiles: index } };
}

// ── 가구 ────────────────────────────────────────────────
/** @type {[string, number, number][]} */
const PROPS = [
  ['desk', 64, 40],
  ['desk_v', 40, 64],
  ['chair', 32, 34],
  ['chair_up', 32, 34],
  ['plant', 32, 48],
  ['bookshelf', 64, 52],
  ['whiteboard', 64, 44],
  ['meeting_table', 160, 96],
  ['sofa', 96, 44],
  ['cooler', 32, 46],
  ['lamp', 32, 52],
  ['server_rack', 32, 56],
  ['coffee_table', 64, 36],
  ['door_mat', 64, 24],
  ['workstation', 64, 56],
  ['round_table', 96, 80],
  ['long_table', 224, 96],
  ['cluster_desk', 128, 96],
  ['printer', 32, 44],
  ['partition', 64, 28],
];

const WOOD = hexRgb('#b77a48');
const WOOD_DARK = hexRgb('#754b32');
const TOP_WHITE = hexRgb('#f2eadb');
const TOP_EDGE = hexRgb('#cdbfa9');
const METAL = hexRgb('#657185');
const METAL_LIGHT = hexRgb('#98a3b2');
const SCREEN = hexRgb('#26354a');
const SCREEN_GLOW = hexRgb('#79b9dc');
const MINT = hexRgb('#8fc5aa');
const MINT_DARK = hexRgb('#55977b');
const LEAF = hexRgb('#4f9b60');
const SHADOW = [140, 150, 165, 55];

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function shadow(d, x0, y0, x1, y1) {
  ellipse(d, x0, y0, x1, y1, SHADOW);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function monitor(d, mx, my, scale = 1) {
  const w = 13 * scale;
  const h = 11 * scale;
  roundedRect(d, mx - w, my, mx + w, my + h, 2, METAL);
  roundedRect(d, mx - w + 2, my + 2, mx + w - 2, my + h - 2, 1, SCREEN);
  rect(d, mx - w + 3, my + 3, mx - 2, my + 5, SCREEN_GLOW);
  rect(d, mx - w + 3, my + 6, mx + 3, my + 7, shade(SCREEN_GLOW, -30));
  rect(d, mx - 2, my + h, mx + 1, my + h + 4, METAL_LIGHT);
  rect(d, mx - 6, my + h + 4, mx + 5, my + h + 6, METAL);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propDesk(d, ox, oy, w, h) {
  const top = oy + 8;
  shadow(d, ox + 2, oy + h - 9, ox + w - 3, oy + h - 1);
  rect(d, ox + 2, top + 12, ox + w - 3, oy + h - 6, WOOD_DARK);
  roundedRect(d, ox, top, ox + w - 1, top + 14, 3, TOP_WHITE, TOP_EDGE);
  rect(d, ox + 2, top + 12, ox + w - 3, top + 14, TOP_EDGE);
  monitor(d, ox + Math.floor(w / 2), oy);
  roundedRect(d, ox + w / 2 - 10, top + 16, ox + w / 2 + 9, top + 21, 2, METAL_LIGHT);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propDeskV(d, ox, oy, w, h) {
  shadow(d, ox + 2, oy + h - 9, ox + w - 3, oy + h - 1);
  rect(d, ox + 3, oy + 20, ox + w - 4, oy + h - 6, WOOD_DARK);
  roundedRect(d, ox + 1, oy + 8, ox + w - 2, oy + h - 14, 3, TOP_WHITE, TOP_EDGE);
  monitor(d, ox + Math.floor(w / 2), oy);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propChair(d, ox, oy, w, h, backTop) {
  shadow(d, ox + 5, oy + h - 8, ox + w - 6, oy + h - 1);
  if (backTop) {
    roundedRect(d, ox + 6, oy + 2, ox + w - 7, oy + 13, 4, MINT_DARK);
    roundedRect(d, ox + 4, oy + 11, ox + w - 5, oy + 25, 5, MINT);
  } else {
    roundedRect(d, ox + 4, oy + 9, ox + w - 5, oy + 23, 5, MINT);
    roundedRect(d, ox + 6, oy + 20, ox + w - 7, oy + 31, 4, MINT_DARK);
  }
  rect(d, ox + 14, oy + 24, ox + 17, oy + h - 5, METAL);
  ellipse(d, ox + 10, oy + h - 8, ox + w - 11, oy + h - 3, METAL_LIGHT);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propPlant(d, ox, oy, w, h) {
  const pot = hexRgb('#e8e2d6');
  shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1);
  polygon(
    d,
    [
      [ox + 8, oy + 30],
      [ox + w - 9, oy + 30],
      [ox + w - 12, oy + h - 4],
      [ox + 11, oy + h - 4],
    ],
    pot,
  );
  rect(d, ox + 8, oy + 30, ox + w - 9, oy + 33, shade(pot, 20));
  for (const [cx, cy, r] of [
    [16, 20, 9],
    [9, 25, 6],
    [23, 25, 6],
    [16, 11, 7],
  ]) {
    ellipse(d, ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r, LEAF);
  }
  for (const [cx, cy, r] of [
    [14, 17, 4],
    [20, 23, 3],
  ]) {
    ellipse(d, ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r, shade(LEAF, 26));
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propBookshelf(d, ox, oy, w, h) {
  shadow(d, ox + 2, oy + h - 7, ox + w - 3, oy + h - 1);
  roundedRect(d, ox, oy, ox + w - 1, oy + h - 5, 2, WOOD);
  rect(d, ox + 3, oy + 3, ox + w - 4, oy + h - 8, hexRgb('#f3ece0'));
  const shelfColors = ['#e07a68', '#6f9ede', '#e3bf55', '#6fc094', '#a982da'];
  for (let row = 0; row < 3; row++) {
    const y = oy + 6 + row * 14;
    rect(d, ox + 3, y + 10, ox + w - 4, y + 12, WOOD);
    for (let i = 0; i < 9; i++) {
      const bx = ox + 6 + i * 6;
      if (bx + 4 > ox + w - 5) break;
      const col = hexRgb(shelfColors[(row * 3 + i) % shelfColors.length]);
      rect(d, bx, y + 1, bx + 4, y + 9, col);
    }
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propWhiteboard(d, ox, oy, w, h) {
  shadow(d, ox + 4, oy + h - 7, ox + w - 5, oy + h - 1);
  roundedRect(d, ox, oy, ox + w - 1, oy + h - 10, 3, hexRgb('#ffffff'), METAL_LIGHT, 2);
  const ink = hexRgb('#6f83a3');
  line(d, ox + 8, oy + 10, ox + 30, oy + 10, ink, 2);
  line(d, ox + 8, oy + 16, ox + 44, oy + 16, ink, 2);
  line(d, ox + 8, oy + 22, ox + 24, oy + 22, hexRgb('#e08585'), 2);
  rect(d, ox + 12, oy + h - 12, ox + 15, oy + h - 4, METAL);
  rect(d, ox + w - 16, oy + h - 12, ox + w - 13, oy + h - 4, METAL);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number[]} box @param {number} radius */
function tableTop(d, box, radius) {
  const [x0, y0, x1, y1] = box;
  roundedRect(d, x0, y0 + 8, x1, y1, radius, WOOD_DARK);
  roundedRect(d, x0, y0, x1, y1 - 8, radius, WOOD);
  roundedRect(d, x0 + 6, y0 + 5, x1 - 6, y1 - 14, radius, shade(WOOD, 12));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propMeetingTable(d, ox, oy, w, h) {
  shadow(d, ox + 6, oy + 20, ox + w - 7, oy + h - 2);
  ellipse(d, ox + 4, oy + 12, ox + w - 5, oy + h - 6, WOOD_DARK);
  ellipse(d, ox + 4, oy + 4, ox + w - 5, oy + h - 14, WOOD);
  ellipse(d, ox + 18, oy + 11, ox + w - 19, oy + h - 25, shade(WOOD, 13));
  for (const [cx, cy] of [
    [40, 30],
    [96, 40],
  ]) {
    roundedRect(d, ox + cx, oy + cy, ox + cx + 20, oy + cy + 13, 2, [255, 255, 255]);
  }
  for (const [cx, cy] of [
    [72, 26],
    [86, 52],
  ]) {
    ellipse(d, ox + cx, oy + cy, ox + cx + 9, oy + cy + 9, [255, 255, 255]);
    ellipse(d, ox + cx + 2, oy + cy + 2, ox + cx + 7, oy + cy + 7, hexRgb('#8a6142'));
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propSofa(d, ox, oy, w, h) {
  const fabric = hexRgb('#c8d3e2');
  shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1);
  roundedRect(d, ox + 2, oy + 2, ox + w - 3, oy + 19, 4, shade(fabric, 14));
  roundedRect(d, ox, oy + 14, ox + w - 1, oy + h - 6, 5, fabric);
  roundedRect(d, ox, oy + 14, ox + 11, oy + h - 6, 4, shade(fabric, -14));
  roundedRect(d, ox + w - 12, oy + 14, ox + w - 1, oy + h - 6, 4, shade(fabric, -14));
  for (let i = 0; i < 2; i++) {
    const cx = ox + 18 + i * 32;
    roundedRect(d, cx, oy + 18, cx + 26, oy + 31, 3, shade(fabric, 8));
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propCooler(d, ox, oy, w, h) {
  shadow(d, ox + 5, oy + h - 7, ox + w - 6, oy + h - 1);
  roundedRect(d, ox + 8, oy + 16, ox + w - 9, oy + h - 4, 2, [255, 255, 255]);
  roundedRect(d, ox + 10, oy + 2, ox + w - 11, oy + 18, 3, hexRgb('#a9dcf5'));
  rect(d, ox + 12, oy + 4, ox + w - 15, oy + 14, hexRgb('#cfeeff'));
  rect(d, ox + 12, oy + 26, ox + w - 13, oy + 30, METAL_LIGHT);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propLamp(d, ox, oy, w, h) {
  shadow(d, ox + 8, oy + h - 7, ox + w - 9, oy + h - 1);
  polygon(
    d,
    [
      [ox + 6, oy + 18],
      [ox + w - 7, oy + 18],
      [ox + w - 11, oy + 2],
      [ox + 10, oy + 2],
    ],
    hexRgb('#fbf1d6'),
  );
  rect(d, ox + 14, oy + 18, ox + 17, oy + h - 6, METAL_LIGHT);
  ellipse(d, ox + 9, oy + h - 10, ox + w - 10, oy + h - 4, METAL);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propServerRack(d, ox, oy, w, h) {
  shadow(d, ox + 3, oy + h - 7, ox + w - 4, oy + h - 1);
  roundedRect(d, ox + 2, oy + 2, ox + w - 3, oy + h - 4, 2, hexRgb('#5c6675'));
  for (let row = 0; row < 7; row++) {
    const y = oy + 6 + row * 7;
    rect(d, ox + 5, y, ox + w - 6, y + 4, hexRgb('#78838f'));
    const led = row % 2 === 0 ? hexRgb('#5ce89b') : hexRgb('#ffc861');
    rect(d, ox + w - 10, y + 1, ox + w - 8, y + 3, led);
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propCoffeeTable(d, ox, oy, w, h) {
  shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1);
  rect(d, ox + 8, oy + 18, ox + w - 9, oy + h - 5, WOOD_DARK);
  tableTop(d, [ox + 2, oy + 4, ox + w - 3, oy + 24], 5);
  roundedRect(d, ox + 22, oy + 9, ox + 42, oy + 17, 2, [255, 255, 255]);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propDoorMat(d, ox, oy, w, h) {
  roundedRect(d, ox + 2, oy + 4, ox + w - 3, oy + h - 4, 4, hexRgb('#bcd3e6'));
  const ix0 = ox + 6;
  const iy0 = oy + 8;
  const iw = ox + w - 7 - ix0 + 1;
  const ih = oy + h - 8 - iy0 + 1;
  d.beginPath();
  d.roundRect(ix0, iy0, iw, ih, 3);
  d.strokeStyle = toFill(hexRgb('#9dbcd6'));
  d.lineWidth = 1;
  d.stroke();
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propWorkstation(d, ox, oy, w, h) {
  shadow(d, ox + 4, oy + h - 9, ox + w - 5, oy + h - 2);
  rect(d, ox + 4, oy + 20, ox + w - 5, oy + 26, WOOD_DARK);
  roundedRect(d, ox + 2, oy + 8, ox + w - 3, oy + 22, 3, TOP_WHITE, TOP_EDGE);
  monitor(d, ox + 22, oy);
  roundedRect(d, ox + w - 16, oy + 10, ox + w - 4, oy + 26, 2, hexRgb('#e9eef4'));
  rect(d, ox + w - 13, oy + 14, ox + w - 7, oy + 15, METAL);
  rect(d, ox + w - 13, oy + 20, ox + w - 7, oy + 21, METAL);
  propChair(d, ox + 6, oy + 22, 32, 34, true);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propRoundTable(d, ox, oy, w, h) {
  const cx = ox + Math.floor(w / 2);
  const cy = oy + Math.floor(h / 2);
  for (const [dx, dy] of [
    [-32, 0],
    [32, 0],
    [0, -26],
    [0, 24],
  ]) {
    roundedRect(d, cx + dx - 10, cy + dy - 9, cx + dx + 10, cy + dy + 9, 5, MINT);
    roundedRect(d, cx + dx - 8, cy + dy - 7, cx + dx + 8, cy + dy + 7, 4, MINT_DARK);
  }
  shadow(d, cx - 26, cy - 12, cx + 26, cy + 22);
  ellipse(d, cx - 26, cy - 14, cx + 26, cy + 18, WOOD_DARK);
  ellipse(d, cx - 26, cy - 20, cx + 26, cy + 12, WOOD);
  ellipse(d, cx - 17, cy - 14, cx + 17, cy + 5, shade(WOOD, 13));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propLongTable(d, ox, oy, w, h) {
  const cy = oy + Math.floor(h / 2);
  for (let i = 0; i < 6; i++) {
    const x = ox + 22 + i * 32;
    roundedRect(d, x, oy + 2, x + 22, oy + 18, 4, MINT);
    roundedRect(d, x, oy + h - 20, x + 22, oy + h - 4, 4, MINT_DARK);
  }
  shadow(d, ox + 10, cy - 18, ox + w - 11, cy + 30);
  tableTop(d, [ox + 8, cy - 26, ox + w - 9, cy + 26], 10);
  for (let i = 0; i < 4; i++) {
    const x = ox + 30 + i * 44;
    roundedRect(d, x, cy - 8, x + 22, cy + 6, 2, [255, 255, 255]);
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propClusterDesk(d, ox, oy, w, h) {
  const cx = ox + Math.floor(w / 2);
  const cy = oy + Math.floor(h / 2);
  shadow(d, ox + 12, cy - 14, ox + w - 13, cy + 34);
  for (const [dx, dy] of [
    [-30, -14],
    [30, -14],
    [-30, 16],
    [30, 16],
  ]) {
    const box = [cx + dx - 30, cy + dy - 14, cx + dx + 28, cy + dy + 12];
    roundedRect(d, box[0], box[1] + 8, box[2], box[3] + 6, 4, TOP_EDGE);
    roundedRect(d, box[0], box[1], box[2], box[3], 4, TOP_WHITE, TOP_EDGE);
    monitor(d, cx + dx - 2, cy + dy - 22);
  }
  for (const [dx, dy] of [
    [-52, 22],
    [52, 22],
    [-52, -24],
    [52, -24],
  ]) {
    roundedRect(d, cx + dx - 10, cy + dy - 9, cx + dx + 10, cy + dy + 9, 5, MINT);
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propPrinter(d, ox, oy, w, h) {
  shadow(d, ox + 4, oy + h - 7, ox + w - 5, oy + h - 1);
  roundedRect(d, ox + 3, oy + 12, ox + w - 4, oy + h - 4, 3, hexRgb('#e4eaf1'));
  roundedRect(d, ox + 6, oy + 4, ox + w - 7, oy + 16, 2, hexRgb('#cfd8e3'));
  rect(d, ox + 8, oy + 22, ox + w - 9, oy + 26, [255, 255, 255]);
  rect(d, ox + w - 10, oy + 15, ox + w - 8, oy + 17, hexRgb('#5ce89b'));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propPartition(d, ox, oy, w, h) {
  shadow(d, ox + 2, oy + h - 6, ox + w - 3, oy + h - 1);
  roundedRect(d, ox, oy + 4, ox + w - 1, oy + h - 6, 2, hexRgb('#dfe7f0'));
  rect(d, ox, oy + 4, ox + w - 1, oy + 7, hexRgb('#c3cfdc'));
  rect(d, ox, oy + h - 9, ox + w - 1, oy + h - 6, hexRgb('#aebdcd'));
}

const PROP_DRAWERS = {
  desk: propDesk,
  desk_v: propDeskV,
  chair: (d, x, y, w, h) => propChair(d, x, y, w, h, false),
  chair_up: (d, x, y, w, h) => propChair(d, x, y, w, h, true),
  plant: propPlant,
  bookshelf: propBookshelf,
  whiteboard: propWhiteboard,
  meeting_table: propMeetingTable,
  sofa: propSofa,
  cooler: propCooler,
  lamp: propLamp,
  server_rack: propServerRack,
  coffee_table: propCoffeeTable,
  door_mat: propDoorMat,
  workstation: propWorkstation,
  round_table: propRoundTable,
  long_table: propLongTable,
  cluster_desk: propClusterDesk,
  printer: propPrinter,
  partition: propPartition,
};

function buildProps() {
  const totalW = PROPS.reduce((sum, [, w]) => sum + w, 0) + PROPS.length * 2;
  const maxH = Math.max(...PROPS.map(([, , h]) => h));
  const canvas = createCanvas(totalW, maxH);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /** @type {Record<string, { x: number, y: number, w: number, h: number }>} */
  const index = {};
  let x = 0;
  for (const [name, w, h] of PROPS) {
    PROP_DRAWERS[name](ctx, x, 0, w, h);
    index[name] = { x, y: 0, w, h };
    x += w + 2;
  }
  return { canvas, meta: { props: index } };
}

// ── 실행 ────────────────────────────────────────────────
function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const { canvas: characters, meta: charMeta } = buildCharacters();
  const { canvas: tiles, meta: tileMeta } = buildTiles();
  const { canvas: props, meta: propMeta } = buildProps();

  const charactersPath = join(OUT_DIR, 'characters.png');
  const tilesPath = join(OUT_DIR, 'tiles.png');
  const propsPath = join(OUT_DIR, 'props.png');
  const manifestPath = join(OUT_DIR, 'manifest.json');

  writeFileSync(charactersPath, characters.toBuffer('image/png'));
  writeFileSync(tilesPath, tiles.toBuffer('image/png'));
  writeFileSync(propsPath, props.toBuffer('image/png'));

  const manifest = { characters: charMeta, ...tileMeta, ...propMeta };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`characters.png  ${characters.width}×${characters.height}  (${CHARACTERS.length}명)`);
  console.log(`tiles.png       ${tiles.width}×${tiles.height}  (${TILE_NAMES.length}종)`);
  console.log(`props.png       ${props.width}×${props.height}  (${PROPS.length}종)`);
  console.log(`→ ${OUT_DIR}`);
}

main();
