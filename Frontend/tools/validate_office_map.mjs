#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'src', 'data', 'office-map.json');
const map = JSON.parse(readFileSync(path, 'utf8'));

if (map.version !== 1 || !Number.isInteger(map.cols) || !Number.isInteger(map.rows)) {
  throw new Error('office-map.json has an unsupported version or invalid dimensions.');
}

const ids = new Set();
for (const zone of map.zones) {
  if (ids.has(zone.id)) throw new Error(`Duplicate zone id: ${zone.id}`);
  ids.add(zone.id);
  if (zone.x < 0 || zone.y < 0 || zone.x + zone.w > map.cols || zone.y + zone.h > map.rows) {
    throw new Error(`Zone is outside map bounds: ${zone.id}`);
  }
  if (zone.seat && (zone.seat.x < 0 || zone.seat.y < 0 || zone.seat.x >= map.cols || zone.seat.y >= map.rows)) {
    throw new Error(`Zone seat is outside map bounds: ${zone.id}`);
  }
}

for (const [label, points] of [
  ['spawn', [map.spawn]],
  ['meeting seat', map.meetingSeats],
]) {
  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x >= map.cols || point.y >= map.rows) {
      throw new Error(`${label} is outside map bounds: ${point.x},${point.y}`);
    }
  }
}

for (const blocker of map.collisionBlockers) {
  if (blocker.x < 0 || blocker.y < 0 || blocker.x + blocker.w > map.cols || blocker.y + blocker.h > map.rows) {
    throw new Error(`Collision blocker is outside map bounds: ${JSON.stringify(blocker)}`);
  }
}

console.log(`office-map.json valid: ${map.cols}x${map.rows}, ${map.zones.length} zones`);
