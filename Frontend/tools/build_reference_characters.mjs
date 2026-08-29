#!/usr/bin/env node

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const atlas = createCanvas(FRAME_W * DIRECTIONS * FRAMES, FRAME_H * ROLES.length);
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

writeFileSync(outputPath, atlas.toBuffer('image/png'));

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.characters.frameWidth = FRAME_W;
manifest.characters.frameHeight = FRAME_H;
manifest.characters.frames = FRAMES;
manifest.characters.rows = Object.fromEntries(ROLES.map((role, index) => [role, index]));
manifest.characters.source = 'docs/design/character-directions-v3.png';
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`Frames: ${FRAME_W}x${FRAME_H}, characters: ${ROLES.length}`);
