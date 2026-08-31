#!/usr/bin/env node
/**
 * 사무실 배경 생성기 (Node.js / @napi-rs/canvas).
 *
 * `office-map.json`(방 배치) + `office-props.json`(장식 가구)을 읽어
 * `tiles.png`/`props.png`(이미 생성된 스프라이트)를 조합해
 * `Frontend/public/map/office-v3.png` 를 만듭니다.
 *
 * 실행 순서: 이 스크립트는 `tiles.png`/`props.png`/`manifest.json` 이
 * 이미 있다고 가정합니다 — 먼저 `npm run sprites` 를 실행하세요.
 * (`npm run map:generate` 가 순서를 대신 챙겨줍니다.)
 *
 * 실행: node Frontend/tools/generate_office.mjs
 * 출력: Frontend/public/map/office-v3.png
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');
const spriteDir = join(__dirname, '..', 'public', 'sprites');
const outPath = join(__dirname, '..', 'public', 'map', 'office-v3.png');

const map = JSON.parse(readFileSync(join(dataDir, 'office-map.json'), 'utf8'));
const propsData = JSON.parse(readFileSync(join(dataDir, 'office-props.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(spriteDir, 'manifest.json'), 'utf8'));

const [tilesImg, propsImg] = await Promise.all([
  loadImage(join(spriteDir, 'tiles.png')),
  loadImage(join(spriteDir, 'props.png')),
]);

const TILE = map.tileSize;
const COLS = map.cols;
const ROWS = map.rows;

// ── 존 조회 헬퍼 ────────────────────────────────────────
/** 해당 타일이 속한 존(내부만 — 벽 타일 자체는 제외) */
function zoneInteriorAt(x, y) {
  for (const zone of map.zones) {
    const right = zone.x + zone.w - 1;
    const bottom = zone.y + zone.h - 1;
    if (x > zone.x && x < right && y > zone.y && y < bottom) return zone;
  }
  return null;
}

/** 해당 타일이 어떤 존의 벽 둘레(perimeter)인지, 아니면 null */
function wallZoneAt(x, y) {
  for (const zone of map.zones) {
    const right = zone.x + zone.w - 1;
    const bottom = zone.y + zone.h - 1;
    const onPerimeter =
      x >= zone.x && x <= right && y >= zone.y && y <= bottom &&
      (x === zone.x || x === right || y === zone.y || y === bottom);
    if (onPerimeter) return { zone, isTop: y === zone.y };
  }
  return null;
}

function isDoorTile(x, y) {
  return map.doors.some((door) => door.x === x && door.y === y);
}

/** 존 종류별 바닥 타일 이름 */
function floorTileFor(zone) {
  if (!zone) return 'floor_tile';
  if (zone.kind === 'department') return 'floor_wood';
  if (zone.kind === 'reception' || zone.kind === 'lounge') return 'carpet';
  return 'floor_tile';
}

// ── 캔버스 준비 ─────────────────────────────────────────
const canvas = createCanvas(COLS * TILE, ROWS * TILE);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function drawTile(name, x, y) {
  const rect = manifest.tiles[name];
  if (!rect) throw new Error(`알 수 없는 타일: ${name}`);
  ctx.drawImage(tilesImg, rect.x, rect.y, rect.w, rect.h, x * TILE, y * TILE, TILE, TILE);
}

/** 소품을 (centerX, centerY) 타일 중심에 맞춰 그립니다 — 발밑 정렬처럼 아래쪽을 기준점으로 삼습니다 */
function drawProp(type, centerX, centerY) {
  const rect = manifest.props[type];
  if (!rect) throw new Error(`알 수 없는 소품: ${type}`);
  const w = rect.w;
  const h = rect.h;
  const px = Math.round(centerX * TILE - w / 2);
  const py = Math.round(centerY * TILE - h);
  ctx.drawImage(propsImg, rect.x, rect.y, rect.w, rect.h, px, py, w, h);
}

// ── 1) 바닥 ─────────────────────────────────────────────
// 벽 타일 자리에도 일단 바닥을 깔아 둡니다 — 그 위에 벽을 그립니다.
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const interior = zoneInteriorAt(x, y);
    drawTile(floorTileFor(interior), x, y);
  }
}

// ── 2) 벽 (문 자리는 비워 둡니다 — 런타임이 그립니다) ──────
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const wall = wallZoneAt(x, y);
    if (!wall) continue;
    if (isDoorTile(x, y)) continue;
    drawTile(wall.isTop ? 'wall_top' : 'wall_face', x, y);
  }
}

// ── 3) 좌석마다 자동 책상 + 의자 ────────────────────────
// 부서장 좌석(zones[].seat)에 더해, 팀원 좌석은 office-staff.ts 에 있어
// 이 Node 스크립트에서 TS 파일을 직접 import 할 수 없으므로
// office-props.json 에 좌석 좌표 사본을 함께 둡니다 (Step 2 참고).
const seats = [
  ...map.zones.filter((zone) => zone.seat).map((zone) => zone.seat),
  ...(propsData.staffSeats ?? []),
];
if (map.ceoSeat) seats.push(map.ceoSeat);

for (const seat of seats) {
  drawProp('desk', seat.x + 0.5, seat.y - 0.5);
  drawProp('chair_up', seat.x + 0.5, seat.y + 0.5);
}

// ── 4) 회의 테이블 ──────────────────────────────────────
if (map.meetingSeats?.length) {
  const xs = map.meetingSeats.map((s) => s.x);
  const ys = map.meetingSeats.map((s) => s.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5;
  drawProp('meeting_table', cx, cy);
}

// ── 5) 장식 가구 ────────────────────────────────────────
for (const item of propsData.items) {
  drawProp(item.type, item.x + 0.5, item.y + 0.5);
}

writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`office-v3.png ${canvas.width}x${canvas.height} → ${outPath}`);
