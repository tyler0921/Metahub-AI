#!/usr/bin/env node

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spriteDir = join(here, '..', 'public', 'sprites');
const manifest = JSON.parse(readFileSync(join(spriteDir, 'manifest.json'), 'utf8'));
const image = await loadImage(join(spriteDir, 'characters.png'));
const canvas = createCanvas(image.width, image.height);
const context = canvas.getContext('2d');
context.drawImage(image, 0, 0);

const { frameWidth, frameHeight, directions, frames, rows } = manifest.characters;
if (directions.join(',') !== 'down,left,right,up' || frames !== 4) {
  throw new Error('Character manifest must define down,left,right,up with four frames.');
}
if (image.width !== frameWidth * directions.length * frames) {
  throw new Error('Character atlas width does not match the manifest.');
}

for (const [role, row] of Object.entries(rows)) {
  const directionHashes = [];
  for (let direction = 0; direction < directions.length; direction += 1) {
    const frameHashes = [];
    for (let frame = 0; frame < frames; frame += 1) {
      const data = context.getImageData(
        (direction * frames + frame) * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
      ).data;
      let opaque = 0;
      for (let offset = 3; offset < data.length; offset += 4) {
        if (data[offset] > 16) opaque++;
      }
      if (opaque < frameWidth * frameHeight * 0.08) {
        throw new Error(`${role}/${directions[direction]}/${frame} has too few character pixels.`);
      }
      frameHashes.push(createHash('sha1').update(data).digest('hex'));
    }
    if (new Set(frameHashes).size < 3) {
      throw new Error(`${role}/${directions[direction]} does not contain a real animation cycle.`);
    }
    directionHashes.push(frameHashes[0]);
  }
  if (new Set(directionHashes).size !== directions.length) {
    throw new Error(`${role} contains duplicated direction art.`);
  }
}

console.log(`Character atlas valid: ${Object.keys(rows).length} roles, 4 directions, 4 frames`);
