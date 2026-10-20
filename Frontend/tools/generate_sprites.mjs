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
import { fileURLToPath, pathToFileURL } from 'node:url';
// Node 24 는 .ts 의 타입을 지우고 바로 실행합니다 — 브라우저와 같은 캐릭터 그리기를 공유합니다
import { CHIBI_ROSTER, CHIBI_SHEET_RES, drawChibi } from '../src/components/office/chibi-character.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 규격 ────────────────────────────────────────────────
const TILE = 32;
const CHAR_W = 32;
// 캐릭터는 셀 위쪽부터 고정 오프셋으로 그려지므로(그림자가 y=47까지 닿음),
// 프레임을 곧이곧대로 48로 두면 아틀라스 검증기가 "가장자리에 닿았다"고 봅니다.
// 아래쪽에 2px 여유를 둬 발밑 그림자가 셀 경계에 닿지 않게 합니다.
const CHAR_H = 50;
const DIRECTIONS = ['down', 'left', 'right', 'up'];
const FRAMES = 4;
/**
 * 시트는 2배 해상도로 굽고, 화면(월드)에는 원본의 1.4배 크기로 그립니다.
 * 시안처럼 머리가 책상 폭의 절반쯤 되도록 키우면서도, 정수 배율로 구워
 * 픽셀 경계가 뭉개지지 않게 합니다 (렌더러가 부드럽게 줄여 그립니다).
 */
const CHAR_RES = CHIBI_SHEET_RES;
const CHAR_DRAW_SCALE = 1.4;

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
// 행 순서·색은 헤더 얼굴 아바타와 같이 쓰도록 chibi-character.ts 에 있습니다
const CHARACTERS = CHIBI_ROSTER.map(({ id, shirt, hair, skin }) => [id, shirt, hair, skin]);

/**
 * 32×50 칸 하나에 캐릭터 한 포즈를 그립니다.
 * 실제 그리기는 브라우저(대표님 외형)와 같이 쓰는 chibi-character.ts 가 맡습니다.
 *
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {[number, number, number]} shirt
 * @param {[number, number, number]} hair
 * @param {[number, number, number]} skin
 */
function drawCharacter(ctx, ox, oy, shirt, hair, skin, direction, frame, role) {
  drawChibi(ctx, ox, oy, { shirt, hair, skin, role }, direction, frame);
}

function buildCharacters() {
  const cols = DIRECTIONS.length * FRAMES;
  const rows = CHARACTERS.length;
  const frameW = CHAR_W * CHAR_RES;
  const frameH = CHAR_H * CHAR_RES;
  const canvas = createCanvas(cols * frameW, rows * frameH);
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
        ctx.save();
        ctx.translate(col * frameW, row * frameH);
        ctx.scale(CHAR_RES, CHAR_RES);
        drawCharacter(ctx, 0, 0, shirt, hair, skin, direction, frame, charId);
        ctx.restore();
      }
    }
  }

  const meta = {
    frameWidth: frameW,
    frameHeight: frameH,
    // 화면(월드 좌표)에 그릴 크기 — 타일 32px 기준
    drawWidth: Math.round(CHAR_W * CHAR_DRAW_SCALE),
    drawHeight: Math.round(CHAR_H * CHAR_DRAW_SCALE),
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
  'floor_cream',
  'carpet_blue',
];

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawFloorWood(d, ox, oy) {
  const base = hexRgb('#d59a5e');
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
  // 복도 — 결 없는 큰 타일. 줄눈만 또렷하게 둡니다
  const base = hexRgb('#d6dce7');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  rect(d, ox + 1, oy + 1, ox + TILE - 2, oy + 2, shade(base, 7));
  rect(d, ox, oy + TILE - 1, ox + TILE - 1, oy + TILE - 1, shade(base, -16));
  rect(d, ox + TILE - 1, oy, ox + TILE - 1, oy + TILE - 1, shade(base, -16));
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
  // 픽셀 중앙(+0.5)에 그어야 왼쪽 이웃 타일(윗벽)의 마지막 열로 번지지 않습니다
  d.strokeRect(ox + 0.5, oy + 0.5, TILE - 1, TILE - 1);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawWallFace(d, ox, oy) {
  // 짙은 네이비 벽 — 위쪽 모서리만 푸르게 빛을 받습니다
  const base = hexRgb('#1d2847');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  rect(d, ox, oy, ox + TILE - 1, oy + 1, hexRgb('#34467a'));
  rect(d, ox + TILE - 1, oy, ox + TILE - 1, oy + TILE - 1, shade(base, -8));
  rect(d, ox, oy + TILE - 4, ox + TILE - 1, oy + TILE - 1, hexRgb('#131a31'));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawWallTop(d, ox, oy) {
  // 윗벽 — 판넬 줄눈이 있는 네이비, 방 안쪽(아래)으로 그림자가 떨어집니다
  const base = hexRgb('#26355f');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  rect(d, ox, oy, ox + TILE - 1, oy + 1, hexRgb('#3c5290'));
  rect(d, ox, oy + 2, ox + TILE - 1, oy + 3, shade(base, 8));
  rect(d, ox, oy + TILE - 5, ox + TILE - 1, oy + TILE - 1, hexRgb('#18213d'));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawGlass(d, ox, oy) {
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, [178, 214, 233, 130]);
  rect(d, ox, oy, ox + TILE - 1, oy + 2, hexRgb('#9fb6c6'));
  rect(d, ox, oy + TILE - 3, ox + TILE - 1, oy + TILE - 1, hexRgb('#9fb6c6'));
  line(d, ox + 6, oy + 4, ox + 2, oy + TILE - 5, [255, 255, 255, 150], 2);
  line(d, ox + 18, oy + 4, ox + 14, oy + TILE - 5, [255, 255, 255, 110], 2);
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawFloorCream(d, ox, oy) {
  // 테라조 — 크림 바탕에 작은 돌 알갱이
  const base = hexRgb('#ece2cf');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  const chips = [[3, 5], [11, 2], [20, 7], [27, 3], [6, 15], [16, 13], [25, 18], [2, 24], [13, 26], [22, 28], [29, 25], [9, 20]];
  chips.forEach(([x, y], i) => {
    const tone = i % 3 === 0 ? -34 : i % 3 === 1 ? -20 : 10;
    rect(d, ox + x, oy + y, ox + x + (i % 2), oy + y, shade(base, tone));
  });
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d @param {number} ox @param {number} oy */
function drawCarpetBlue(d, ox, oy) {
  // 회의실·라운지 카펫 — 연한 청회색에 잔잔한 마름모 결
  const base = hexRgb('#c3cfe3');
  rect(d, ox, oy, ox + TILE - 1, oy + TILE - 1, base);
  for (let y = 0; y < TILE; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < TILE; x += 4) {
      point(d, ox + x, oy + y, shade(base, 9));
      point(d, ox + x + 1, oy + y + 2, shade(base, -9));
    }
  }
}

const TILE_DRAWERS = {
  floor_wood: drawFloorWood,
  floor_tile: drawFloorTile,
  carpet: drawCarpet,
  wall_face: drawWallFace,
  wall_top: drawWallTop,
  rug_edge: drawRugEdge,
  glass: drawGlass,
  floor_cream: drawFloorCream,
  carpet_blue: drawCarpetBlue,
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
  ['plant_large', 44, 64],
  ['plant_bush', 40, 52],
  ['armchair_l', 32, 40],
  ['armchair_r', 32, 40],
  ['reception_desk', 112, 56],
  ['sofa_blue', 96, 44],
  ['sofa_v', 40, 100],
  ['round_coffee', 40, 34],
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
  // 크림색 상판 + 가는 다리 — 앞쪽에 앉은 직원 머리가 상판 앞모서리에 걸칩니다
  const top = oy + 10;
  shadow(d, ox + 2, oy + h - 8, ox + w - 3, oy + h - 1);
  for (const lx of [ox + 3, ox + w - 7]) rect(d, lx, top + 14, lx + 3, oy + h - 4, WOOD_DARK);
  roundedRect(d, ox, top + 4, ox + w - 1, top + 16, 3, TOP_EDGE);
  roundedRect(d, ox, top, ox + w - 1, top + 13, 3, TOP_WHITE);
  rect(d, ox + 2, top + 1, ox + w - 3, top + 1, shade(TOP_WHITE, 10));
  monitor(d, ox + Math.floor(w / 2) - 8, oy, 0.8);
  roundedRect(d, ox + w / 2 - 14, top + 6, ox + w / 2 + 2, top + 9, 1, METAL_LIGHT);
  // 서류 한 장과 머그
  roundedRect(d, ox + w - 22, top + 3, ox + w - 10, top + 10, 1, [255, 255, 255]);
  roundedRect(d, ox + 6, top + 3, ox + 11, top + 9, 2, hexRgb('#6f9ede'));
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
  // 포스트잇
  for (const [nx, ny, color] of [[44, 6, '#f6d365'], [52, 12, '#f49ac1'], [44, 20, '#8fd3b6'], [30, 22, '#9ec5ff']]) {
    rect(d, ox + nx, oy + ny, ox + nx + 6, oy + ny + 6, hexRgb(color));
  }
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
function propSofa(d, ox, oy, w, h, fabricHex = '#c8d3e2') {
  const fabric = hexRgb(fabricHex);
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

/** 잎 하나 — 회전된 타원 + 가운데 잎맥 */
function leaf(d, cx, cy, rx, ry, angle, color) {
  d.save();
  d.translate(cx, cy);
  d.rotate(angle);
  d.beginPath();
  d.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  d.fillStyle = toFill(color);
  d.fill();
  d.strokeStyle = toFill(shade(color, 26));
  d.lineWidth = 1;
  d.beginPath();
  d.moveTo(-rx + 2, 0);
  d.lineTo(rx - 2, 0);
  d.stroke();
  d.restore();
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propPlantLarge(d, ox, oy, w, h) {
  // 몬스테라 — 방 모서리를 채우는 큰 화분
  const pot = hexRgb('#ebe7e1');
  shadow(d, ox + 8, oy + h - 9, ox + w - 9, oy + h - 1);
  polygon(d, [[ox + 11, oy + h - 22], [ox + w - 12, oy + h - 22], [ox + w - 15, oy + h - 3], [ox + 14, oy + h - 3]], pot);
  rect(d, ox + 10, oy + h - 23, ox + w - 11, oy + h - 20, shade(pot, 10));
  rect(d, ox + 14, oy + h - 8, ox + w - 15, oy + h - 4, shade(pot, -22));
  const cx = ox + w / 2;
  const dark = hexRgb('#2f7a43');
  const mid = hexRgb('#43984f');
  const light = hexRgb('#6bbb5e');
  for (const [dx, dy, rx, ry, a, c] of [
    [-11, 26, 11, 6, -0.5, dark], [11, 26, 11, 6, 0.5, dark],
    [-9, 15, 11, 6, -0.9, mid], [9, 14, 11, 6, 0.9, mid],
    [0, 9, 10, 5, -1.57, mid], [-13, 33, 9, 5, -0.2, mid], [13, 33, 9, 5, 0.2, mid],
    [-4, 20, 9, 5, -1.2, light], [5, 21, 9, 5, 1.1, light],
  ]) {
    leaf(d, cx + dx, oy + dy, rx, ry, a, c);
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propPlantBush(d, ox, oy, w, h) {
  // 로비의 둥근 관목 — 흰 사각 화분
  const planter = hexRgb('#eef0f4');
  shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1);
  roundedRect(d, ox + 6, oy + h - 22, ox + w - 7, oy + h - 3, 2, planter);
  rect(d, ox + 6, oy + h - 7, ox + w - 7, oy + h - 3, shade(planter, -24));
  rect(d, ox + 6, oy + h - 22, ox + w - 7, oy + h - 21, [255, 255, 255]);
  const cx = ox + w / 2;
  for (const [dx, dy, r, c] of [
    [-9, 22, 9, '#2f7a43'], [9, 22, 9, '#2f7a43'], [0, 24, 10, '#2f7a43'],
    [-7, 13, 9, '#43984f'], [7, 12, 9, '#43984f'], [0, 17, 10, '#43984f'],
    [-3, 9, 6, '#6bbb5e'], [5, 16, 5, '#6bbb5e'], [-8, 19, 4, '#6bbb5e'],
  ]) {
    ellipse(d, cx + dx - r, oy + dy - r, cx + dx + r, oy + dy + r, hexRgb(c));
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propArmchair(d, ox, oy, w, h, facingRight) {
  // 나무 팔걸이의자 — 옆에서 본 모습. facingRight 면 앉는 쪽이 오른쪽
  shadow(d, ox + 3, oy + h - 8, ox + w - 4, oy + h - 1);
  const back = facingRight ? ox + 3 : ox + w - 10;
  rect(d, ox + 5, oy + h - 9, ox + 7, oy + h - 3, WOOD_DARK);
  rect(d, ox + w - 8, oy + h - 9, ox + w - 6, oy + h - 3, WOOD_DARK);
  roundedRect(d, ox + 3, oy + 12, ox + w - 4, oy + h - 8, 3, WOOD);
  roundedRect(d, ox + 6, oy + 15, ox + w - 7, oy + h - 11, 2, hexRgb('#d9a46b'));
  roundedRect(d, back, oy + 4, back + 6, oy + h - 8, 3, shade(WOOD, -10));
  rect(d, ox + 3, oy + 12, ox + w - 4, oy + 13, shade(WOOD, 18));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propReceptionDesk(d, ox, oy, w, h) {
  // 로비 안내 데스크 — 둥근 모서리 나무 상판 + 짙은 앞판
  shadow(d, ox + 4, oy + h - 10, ox + w - 5, oy + h - 1);
  roundedRect(d, ox + 2, oy + 16, ox + w - 3, oy + h - 5, 6, WOOD_DARK);
  for (let i = 1; i < 4; i++) {
    const x = Math.round(ox + 2 + (i * (w - 4)) / 4);
    rect(d, x, oy + 26, x, oy + h - 9, shade(WOOD_DARK, -14));
  }
  roundedRect(d, ox, oy + 6, ox + w - 1, oy + 26, 8, WOOD);
  roundedRect(d, ox + 4, oy + 9, ox + w - 5, oy + 22, 6, shade(WOOD, 14));
  roundedRect(d, ox + 16, oy + 11, ox + 34, oy + 21, 1, [255, 255, 255]);
  roundedRect(d, ox + 44, oy + 13, ox + 84, oy + 18, 2, hexRgb('#eef1f6'));
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propSofaV(d, ox, oy, w, h) {
  // 세로로 놓인 소파 — 등받이가 왼쪽, 앉는 쪽이 오른쪽
  const fabric = hexRgb('#5d7fb8');
  shadow(d, ox + 4, oy + h - 10, ox + w - 3, oy + h - 1);
  roundedRect(d, ox + 2, oy + 4, ox + w - 3, oy + h - 6, 5, fabric);
  roundedRect(d, ox + 2, oy + 4, ox + 12, oy + h - 6, 4, shade(fabric, -16));
  roundedRect(d, ox + 2, oy + 4, ox + w - 3, oy + 13, 4, shade(fabric, -10));
  roundedRect(d, ox + 2, oy + h - 16, ox + w - 3, oy + h - 6, 4, shade(fabric, -10));
  for (let i = 0; i < 2; i++) {
    const cy = oy + 16 + i * 34;
    roundedRect(d, ox + 14, cy, ox + w - 6, cy + 30, 3, shade(fabric, 10));
  }
}

/** @param {import('@napi-rs/canvas').SKRSContext2D} d */
function propRoundCoffee(d, ox, oy, w, h) {
  shadow(d, ox + 5, oy + h - 9, ox + w - 6, oy + h - 1);
  rect(d, ox + w / 2 - 2, oy + 16, ox + w / 2 + 1, oy + h - 5, WOOD_DARK);
  ellipse(d, ox + 3, oy + 6, ox + w - 4, oy + 22, WOOD_DARK);
  ellipse(d, ox + 3, oy + 3, ox + w - 4, oy + 19, hexRgb('#e3a86e'));
  ellipse(d, ox + 14, oy + 7, ox + 24, oy + 14, [255, 255, 255, 200]);
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
  plant_large: propPlantLarge,
  plant_bush: propPlantBush,
  armchair_l: (d, x, y, w, h) => propArmchair(d, x, y, w, h, false),
  armchair_r: (d, x, y, w, h) => propArmchair(d, x, y, w, h, true),
  reception_desk: propReceptionDesk,
  sofa_blue: (d, x, y, w, h) => propSofa(d, x, y, w, h, '#5d7fb8'),
  sofa_v: propSofaV,
  round_coffee: propRoundCoffee,
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

// 직접 실행했을 때만 돌립니다 — 다른 스크립트가 drawCharacter 등을
// import 할 때는 부수효과(파일 쓰기)가 함께 실행되면 안 됩니다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { drawCharacter, hexRgb, CHAR_W, CHAR_H, DIRECTIONS, FRAMES };
