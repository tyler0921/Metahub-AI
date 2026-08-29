#!/usr/bin/env node

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  drawCharacter,
  hexRgb,
  CHAR_W as GEN_CHAR_W,
  CHAR_H as GEN_CHAR_H,
  DIRECTIONS as GEN_DIRECTIONS,
  FRAMES as GEN_FRAMES,
} from './generate_sprites.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spriteDir = join(here, '..', 'public', 'sprites');
const sourcePath = join(here, '..', '..', 'docs', 'design', 'character-directions-v3.png');
const outputPath = join(spriteDir, 'characters.png');
const manifestPath = join(spriteDir, 'manifest.json');

const FRAME_W = 48;
const FRAME_H = 72;
const DIRECTIONS = 4;
const FRAMES = 4;
const ROLES = ['ceo', 'chief', 'planner', 'researcher', 'marketer', 'dev', 'finance', 'writer'];
const FRAME_X = [0, -1, 0, 1];
const FRAME_Y = [0, 1, 0, 1];

/**
 * 참조 원화가 없는 신규 캐릭터(디자인팀 등) — 절차적 생성기(generate_sprites.mjs)의
 * drawCharacter 로 한 행을 더 그려 붙입니다. 참조 원화 행들보다 살짝 단순하지만
 * 워크사이클(다리 스윙)이 있어 어색하게 붕 뜨지 않습니다.
 * [id, 셔츠, 머리, 피부] — CHARACTERS 배열(generate_sprites.mjs)과 같은 값을 씁니다.
 */
const PROCEDURAL_ROLES = [['designer', '#c9578b', '#3a2a20', '#f0c9a0']];

const source = await loadImage(sourcePath);
const sourceCanvas = createCanvas(source.width, source.height);
const sourceCtx = sourceCanvas.getContext('2d');
sourceCtx.drawImage(source, 0, 0);
const pixels = sourceCtx.getImageData(0, 0, source.width, source.height).data;

function alphaAt(x, y) {
  return pixels[(y * source.width + x) * 4 + 3] ?? 0;
}

function occupiedRuns(length, occupiedAt) {
  const runs = [];
  let start = -1;
  for (let index = 0; index < length; index += 1) {
    const occupied = occupiedAt(index);
    if (occupied && start < 0) start = index;
    if (!occupied && start >= 0) {
      runs.push([start, index - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, length - 1]);
  return runs;
}

// 이미지 생성 결과의 캐릭터 행은 정확히 같은 높이가 아닙니다.
// source.height / 8 로 자르면 행마다 16~29px의 발이 다음 셀 경계 밖으로
// 나가므로, 실제 불투명 픽셀 띠를 기준으로 8개 행을 찾습니다.
const rowRuns = occupiedRuns(source.height, (y) => {
  for (let x = 0; x < source.width; x += 1) {
    if (alphaAt(x, y) >= 24) return true;
  }
  return false;
});

if (rowRuns.length !== ROLES.length) {
  throw new Error(`Expected ${ROLES.length} character rows, found ${rowRuns.length}`);
}

const columnRunsByRow = rowRuns.map(([y0, y1], row) => {
  const runs = occupiedRuns(source.width, (x) => {
    for (let y = y0; y <= y1; y += 1) {
      if (alphaAt(x, y) >= 24) return true;
    }
    return false;
  });
  if (runs.length !== DIRECTIONS) {
    throw new Error(`Expected ${DIRECTIONS} directions in row ${row}, found ${runs.length}`);
  }
  return runs;
});

function contentBounds(column, row) {
  const rowRun = rowRuns[row];
  const columnRun = columnRunsByRow[row]?.[column];
  if (!rowRun || !columnRun) throw new Error(`Missing source cell ${column},${row}`);
  const [x0, x1] = columnRun;
  const [y0, y1] = rowRun;
  let left = x1;
  let right = x0;
  let top = y1;
  let bottom = y0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (alphaAt(x, y) < 24) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`No character pixels in cell ${column},${row}`);
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const atlas = createCanvas(
  FRAME_W * DIRECTIONS * FRAMES,
  FRAME_H * (ROLES.length + PROCEDURAL_ROLES.length),
);
const ctx = atlas.getContext('2d');
ctx.imageSmoothingEnabled = false;

for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
  const directionBounds = Array.from({ length: DIRECTIONS }, (_, direction) =>
    contentBounds(direction, roleIndex),
  );
  const scale = Math.min(
    ...directionBounds.map((bounds) =>
      Math.min((FRAME_W - 4) / bounds.w, (FRAME_H - 4) / bounds.h),
    ),
  );

  for (let direction = 0; direction < DIRECTIONS; direction += 1) {
    const bounds = directionBounds[direction];
    const width = Math.max(1, Math.round(bounds.w * scale));
    const height = Math.max(1, Math.round(bounds.h * scale));
    for (let frame = 0; frame < FRAMES; frame += 1) {
      const cellX = (direction * FRAMES + frame) * FRAME_W;
      const dx = cellX + Math.floor((FRAME_W - width) / 2) + FRAME_X[frame];
      const dy = roleIndex * FRAME_H + FRAME_H - height - 2 + FRAME_Y[frame];
      ctx.drawImage(
        source,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        dx,
        dy,
        width,
        height,
      );
    }
  }
}

// 참조 원화가 없는 캐릭터 — 절차적으로 그린 프레임을 같은 셀 크기로
// 스케일해 붙입니다. 배치 방식(가운데 정렬·바닥 고정)은 위 원화 행과 같습니다.
const procScale = Math.min((FRAME_W - 4) / GEN_CHAR_W, (FRAME_H - 4) / GEN_CHAR_H);
const procWidth = Math.round(GEN_CHAR_W * procScale);
const procHeight = Math.round(GEN_CHAR_H * procScale);

for (let procIndex = 0; procIndex < PROCEDURAL_ROLES.length; procIndex += 1) {
  const [roleId, shirtHex, hairHex, skinHex] = PROCEDURAL_ROLES[procIndex];
  const shirt = hexRgb(shirtHex);
  const hair = hexRgb(hairHex);
  const skin = hexRgb(skinHex);
  const roleIndex = ROLES.length + procIndex;

  const cell = createCanvas(GEN_CHAR_W, GEN_CHAR_H);
  const cellCtx = cell.getContext('2d');

  for (let direction = 0; direction < GEN_DIRECTIONS.length; direction += 1) {
    for (let frame = 0; frame < GEN_FRAMES; frame += 1) {
      cellCtx.clearRect(0, 0, GEN_CHAR_W, GEN_CHAR_H);
      drawCharacter(cellCtx, 0, 0, shirt, hair, skin, GEN_DIRECTIONS[direction], frame, roleId);

      const cellX = (direction * FRAMES + frame) * FRAME_W;
      const dx = cellX + Math.floor((FRAME_W - procWidth) / 2) + FRAME_X[frame];
      const dy = roleIndex * FRAME_H + FRAME_H - procHeight - 2 + FRAME_Y[frame];
      ctx.drawImage(cell, 0, 0, GEN_CHAR_W, GEN_CHAR_H, dx, dy, procWidth, procHeight);
    }
  }
}

writeFileSync(outputPath, atlas.toBuffer('image/png'));

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.characters.frameWidth = FRAME_W;
manifest.characters.frameHeight = FRAME_H;
manifest.characters.frames = FRAMES;
manifest.characters.rows = Object.fromEntries(
  [...ROLES, ...PROCEDURAL_ROLES.map(([id]) => id)].map((role, index) => [role, index]),
);
manifest.characters.source = 'docs/design/character-directions-v3.png (+ 절차적 생성: designer)';
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`Frames: ${FRAME_W}x${FRAME_H}, characters: ${ROLES.length}`);
