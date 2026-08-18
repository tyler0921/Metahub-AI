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
  ['CEO seat', [map.ceoSeat]],
  ['meeting seat', map.meetingSeats],
]) {
  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x >= map.cols || point.y >= map.rows) {
      throw new Error(`${label} is outside map bounds: ${point.x},${point.y}`);
    }
  }
}

const ceoOffice = map.zones.find((zone) => zone.id === 'ceo-office');
if (!ceoOffice) throw new Error('office-map.json must define a ceo-office zone.');
if (
  map.ceoSeat.x < ceoOffice.x || map.ceoSeat.x >= ceoOffice.x + ceoOffice.w ||
  map.ceoSeat.y < ceoOffice.y || map.ceoSeat.y >= ceoOffice.y + ceoOffice.h
) {
  throw new Error('CEO seat must be inside the ceo-office zone.');
}

const doorZones = new Set();
const doorKeys = new Set();
for (const door of map.doors ?? []) {
  const zone = map.zones.find((candidate) => candidate.id === door.zoneId);
  if (!zone) throw new Error(`Door references an unknown zone: ${door.zoneId}`);
  const key = `${door.x},${door.y}`;
  if (doorKeys.has(key)) throw new Error(`Duplicate door coordinate: ${key}`);
  doorKeys.add(key);
  doorZones.add(door.zoneId);
  const right = zone.x + zone.w - 1;
  const bottom = zone.y + zone.h - 1;
  const onPerimeter =
    door.x >= zone.x && door.x <= right && door.y >= zone.y && door.y <= bottom &&
    (door.x === zone.x || door.x === right || door.y === zone.y || door.y === bottom);
  if (!onPerimeter) throw new Error(`Door must be on its room perimeter: ${door.zoneId}`);
}
for (const zone of map.zones) {
  if (!doorZones.has(zone.id)) throw new Error(`Room has no door: ${zone.id}`);
}

for (const blocker of map.collisionBlockers) {
  if (blocker.x < 0 || blocker.y < 0 || blocker.x + blocker.w > map.cols || blocker.y + blocker.h > map.rows) {
    throw new Error(`Collision blocker is outside map bounds: ${JSON.stringify(blocker)}`);
  }
}

// 런타임과 같은 순서로 벽·가구·문을 적용하고 모든 문이 연결되는지 확인합니다.
const blocked = Array.from({ length: map.rows }, (_, y) =>
  Array.from({ length: map.cols }, (_, x) =>
    x === 0 || y === 0 || x === map.cols - 1 || y === map.rows - 1,
  ),
);
for (const zone of map.zones) {
  const right = zone.x + zone.w - 1;
  const bottom = zone.y + zone.h - 1;
  for (let x = zone.x; x <= right; x += 1) {
    blocked[zone.y][x] = true;
    blocked[bottom][x] = true;
  }
  for (let y = zone.y; y <= bottom; y += 1) {
    blocked[y][zone.x] = true;
    blocked[y][right] = true;
  }
}
for (const blocker of map.collisionBlockers) {
  for (let y = blocker.y; y < blocker.y + blocker.h; y += 1) {
    for (let x = blocker.x; x < blocker.x + blocker.w; x += 1) blocked[y][x] = true;
  }
}
for (const door of map.doors) blocked[door.y][door.x] = false;
blocked[map.spawn.y][map.spawn.x] = false;

const queue = [map.spawn];
const visited = new Set([`${map.spawn.x},${map.spawn.y}`]);
for (let index = 0; index < queue.length; index += 1) {
  const point = queue[index];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = point.x + dx;
    const y = point.y + dy;
    const key = `${x},${y}`;
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows || blocked[y][x] || visited.has(key)) continue;
    visited.add(key);
    queue.push({ x, y });
  }
}
for (const door of map.doors) {
  if (!visited.has(`${door.x},${door.y}`)) {
    throw new Error(`Door is unreachable from spawn: ${door.zoneId} (${door.x},${door.y})`);
  }
}

console.log(`office-map.json valid: ${map.cols}x${map.rows}, ${map.zones.length} zones`);
