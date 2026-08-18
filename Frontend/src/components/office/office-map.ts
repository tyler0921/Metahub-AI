import type { AgentId } from '@shared';
import mapConfig from '@/data/office-map.json';
import { STAFF_SEAT_POINTS } from './office-staff';

export type ZoneKind = 'department' | 'lounge' | 'meeting' | 'reception' | 'entrance' | 'cafe';

export interface Point {
  x: number;
  y: number;
}

export interface Zone {
  id: string;
  label: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  agent?: AgentId;
  seat?: Point;
  rug?: boolean;
  showLabel?: boolean;
}

interface CollisionRect extends Point {
  w: number;
  h: number;
}

export interface Door extends Point {
  zoneId: string;
}

interface OfficeMapData {
  version: 1;
  tileSize: number;
  cols: number;
  rows: number;
  spawn: Point;
  ceoSeat: Point;
  zones: Zone[];
  doors: Door[];
  meetingSeats: Point[];
  collisionBlockers: CollisionRect[];
}

/** 모든 공간 배치와 충돌 좌표의 단일 원본은 src/data/office-map.json 입니다. */
const MAP = mapConfig as unknown as OfficeMapData;

export const TILE = MAP.tileSize;
export const MAP_COLS = MAP.cols;
export const MAP_ROWS = MAP.rows;
export const MAP_W = MAP_COLS * TILE;
export const MAP_H = MAP_ROWS * TILE;
export const ZONES: readonly Zone[] = MAP.zones;
export const DOORS: ReadonlyArray<Door> = MAP.doors;
export const DEPARTMENT_ZONES = ZONES.filter((zone) => zone.agent);
export const SPAWN: Readonly<Point> = MAP.spawn;
export const CEO_SEAT: Readonly<Point> = MAP.ceoSeat;
export const MEETING_SEATS: ReadonlyArray<Point> = MAP.meetingSeats;

export type CellKind = 'wall' | 'floor' | 'glass';
export type FloorKind = 'tile' | 'wood';

export interface MapGrid {
  cells: CellKind[][];
  floor: FloorKind[][];
  zoneAt: (Zone | null)[][];
  blocked: boolean[][];
}

export function buildGrid(): MapGrid {
  const cells: CellKind[][] = Array.from({ length: MAP_ROWS }, (_, y) =>
    Array.from({ length: MAP_COLS }, (_, x): CellKind =>
      x === 0 || y === 0 || x === MAP_COLS - 1 || y === MAP_ROWS - 1 ? 'wall' : 'floor',
    ),
  );
  const floor: FloorKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): FloorKind => 'tile'),
  );
  const zoneAt: (Zone | null)[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): Zone | null => null),
  );

  for (const zone of ZONES) {
    for (let y = zone.y; y < zone.y + zone.h; y++) {
      for (let x = zone.x; x < zone.x + zone.w; x++) {
        zoneAt[y]![x] = zone;
      }
    }
  }

  const blocked = cells.map((row) => row.map((cell) => cell !== 'floor'));

  // 정적 배경에 그려진 각 방의 둘레를 실제 충돌 벽으로 만듭니다.
  for (const zone of ZONES) {
    const right = zone.x + zone.w - 1;
    const bottom = zone.y + zone.h - 1;
    for (let x = zone.x; x <= right; x++) {
      blocked[zone.y]![x] = true;
      blocked[bottom]![x] = true;
    }
    for (let y = zone.y; y <= bottom; y++) {
      blocked[y]![zone.x] = true;
      blocked[y]![right] = true;
    }
  }

  for (const rect of MAP.collisionBlockers) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) blocked[y]![x] = true;
    }
  }

  // 벽을 만든 뒤 선언된 출입문 타일만 다시 엽니다.
  for (const door of DOORS) blocked[door.y]![door.x] = false;

  // 좌석과 입구는 배경 가구 충돌 영역과 겹치더라도 도착 가능한 지점이어야 합니다.
  for (const seat of [
    ...DEPARTMENT_ZONES.flatMap((zone) => zone.seat ? [zone.seat] : []),
    ...MEETING_SEATS,
    ...STAFF_SEAT_POINTS,
    CEO_SEAT,
    SPAWN,
  ]) {
    if (blocked[seat.y]?.[seat.x] !== undefined) blocked[seat.y]![seat.x] = false;
  }

  return { cells, floor, zoneAt, blocked };
}

export const GRID = buildGrid();

export const isBlocked = (x: number, y: number): boolean => {
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return true;
  return GRID.blocked[ty]?.[tx] ?? true;
};

export const zoneAtTile = (x: number, y: number): Zone | null =>
  GRID.zoneAt[Math.round(y)]?.[Math.round(x)] ?? null;

export const zoneAt = zoneAtTile;

interface Node extends Point {
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBORS = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;

export function findPath(from: Point, to: Point, maxNodes = 5_000): Point[] {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const goal = { x: Math.round(to.x), y: Math.round(to.y) };
  if (isBlocked(goal.x, goal.y) || (start.x === goal.x && start.y === goal.y)) return [];

  const key = (x: number, y: number): number => y * MAP_COLS + x;
  const heuristic = (x: number, y: number): number => Math.hypot(goal.x - x, goal.y - y);
  const open: Node[] = [
    { ...start, g: 0, f: heuristic(start.x, start.y), parent: null },
  ];
  const best = new Map<number, number>([[key(start.x, start.y), 0]]);
  const closed = new Set<number>();
  let expanded = 0;

  while (open.length > 0 && expanded < maxNodes) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index++) {
      if ((open[index]?.f ?? Infinity) < (open[bestIndex]?.f ?? Infinity)) bestIndex = index;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (!current) break;

    if (current.x === goal.x && current.y === goal.y) {
      const path: Point[] = [];
      for (let node: Node | null = current; node; node = node.parent) {
        path.push({ x: node.x, y: node.y });
      }
      path.reverse();
      path.shift();
      return path;
    }

    closed.add(key(current.x, current.y));
    expanded++;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (isBlocked(nx, ny) || closed.has(key(nx, ny))) continue;
      if (
        dx !== 0 && dy !== 0 &&
        (isBlocked(current.x + dx, current.y) || isBlocked(current.x, current.y + dy))
      ) continue;

      const g = current.g + (dx !== 0 && dy !== 0 ? 1.414 : 1);
      const nodeKey = key(nx, ny);
      if (g >= (best.get(nodeKey) ?? Infinity)) continue;
      best.set(nodeKey, g);
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny), parent: current });
    }
  }

  return [];
}
