import type { AgentId } from '@shared';
import { STAFF_SEAT_POINTS } from './office-staff';

export const TILE = 32;
export const MAP_COLS = 62;
export const MAP_ROWS = 40;
export const MAP_W = MAP_COLS * TILE;
export const MAP_H = MAP_ROWS * TILE;

export type ZoneKind = 'department' | 'lounge' | 'meeting' | 'reception' | 'entrance' | 'cafe';

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
  seat?: { x: number; y: number };
  rug?: boolean;
  showLabel?: boolean;
}

const LEFT_X = 1;
const LEFT_W = 15;
const MAIN_X = 18;
const MAIN_W = 28;
const RIGHT_X = 48;
const RIGHT_W = 13;

/**
 * 참고 이미지의 구성을 서비스에 맞게 재해석한 오피스 플랜.
 * 좌측은 협업실, 중앙은 오픈 오피스, 우측은 편의·집중 공간이다.
 */
export const ZONES: readonly Zone[] = [
  { id: 'boardroom', label: 'BOARD ROOM · A', kind: 'meeting', x: LEFT_X, y: 1, w: LEFT_W, h: 11, color: '#92714f', rug: true },
  { id: 'huddle-room', label: 'HUDDLE ROOM · B', kind: 'meeting', x: LEFT_X, y: 13, w: LEFT_W, h: 10, color: '#71839a', rug: true },
  { id: 'project-studio', label: 'PROJECT STUDIO', kind: 'lounge', x: LEFT_X, y: 25, w: LEFT_W, h: 14, color: '#6f8579', rug: false },

  { id: 'reception', label: 'EXECUTIVE OFFICE', kind: 'reception', x: MAIN_X, y: 1, w: MAIN_W, h: 7, color: '#b48b43', agent: 'chief', seat: { x: 32, y: 5 }, rug: false },
  { id: 'researcher', label: '리서치', kind: 'department', x: 19, y: 9, w: 8, h: 10, color: '#76679a', agent: 'researcher', seat: { x: 23, y: 12 }, rug: false },
  { id: 'planner', label: '기획', kind: 'department', x: 28, y: 9, w: 8, h: 10, color: '#527da0', agent: 'planner', seat: { x: 32, y: 12 }, rug: false },
  { id: 'dev', label: '개발', kind: 'department', x: 37, y: 9, w: 8, h: 10, color: '#3f857d', agent: 'dev', seat: { x: 41, y: 12 }, rug: false },
  { id: 'marketer', label: '마케팅', kind: 'department', x: 19, y: 20, w: 8, h: 10, color: '#ad6471', agent: 'marketer', seat: { x: 23, y: 23 }, rug: false },
  { id: 'finance', label: '재무', kind: 'department', x: 28, y: 20, w: 8, h: 10, color: '#63727c', agent: 'finance', seat: { x: 32, y: 23 }, rug: false },
  { id: 'writer', label: '문서', kind: 'department', x: 37, y: 20, w: 8, h: 10, color: '#6f8ea3', agent: 'writer', seat: { x: 41, y: 23 }, rug: false },
  { id: 'entrance', label: 'MAIN LOBBY', kind: 'entrance', x: MAIN_X, y: 32, w: MAIN_W, h: 7, color: '#7b8795', rug: false },

  { id: 'showcase', label: 'SHOWCASE', kind: 'lounge', x: RIGHT_X, y: 1, w: RIGHT_W, h: 8, color: '#a77d46', rug: false },
  { id: 'cafe', label: 'OFFICE CAFE', kind: 'cafe', x: RIGHT_X, y: 10, w: RIGHT_W, h: 13, color: '#7a8d78', rug: true },
  { id: 'focus-lounge', label: 'FOCUS LOUNGE', kind: 'lounge', x: RIGHT_X, y: 25, w: RIGHT_W, h: 14, color: '#6d8193', rug: false },
];

export const DEPARTMENT_ZONES = ZONES.filter((zone) => zone.agent);
export const SPAWN = { x: 32, y: 36 };

const MEETING = ZONES.find((zone) => zone.id === 'boardroom')!;

export const MEETING_SEATS: ReadonlyArray<{ x: number; y: number }> = [
  { x: MEETING.x + 3, y: MEETING.y + 4 },
  { x: MEETING.x + 5, y: MEETING.y + 3 },
  { x: MEETING.x + 7, y: MEETING.y + 3 },
  { x: MEETING.x + 9, y: MEETING.y + 3 },
  { x: MEETING.x + 11, y: MEETING.y + 4 },
  { x: MEETING.x + 11, y: MEETING.y + 8 },
  { x: MEETING.x + 8, y: MEETING.y + 9 },
  { x: MEETING.x + 5, y: MEETING.y + 9 },
  { x: MEETING.x + 3, y: MEETING.y + 8 },
];

export type PropKind =
  | 'desk' | 'chair_up' | 'plant' | 'bookshelf' | 'whiteboard'
  | 'meeting_table' | 'sofa' | 'cooler' | 'lamp' | 'server_rack'
  | 'coffee_table' | 'door_mat' | 'workstation' | 'round_table'
  | 'long_table' | 'cluster_desk' | 'printer' | 'partition';

export interface PropInstance {
  kind: PropKind;
  x: number;
  y: number;
  block?: { w: number; h: number };
  tag?: string;
}

const TEAM_WORKSTATIONS: readonly PropInstance[] = [
  [23, 12], [21, 16], [25, 16],
  [32, 12], [30, 16], [34, 16],
  [41, 12], [39, 16], [43, 16],
  [23, 23], [21, 27], [25, 27],
  [32, 23], [30, 27], [34, 27],
  [41, 23], [39, 27], [43, 27],
].map(([x, y]) => ({ kind: 'workstation', x, y: y - 1, block: { w: 2, h: 1 } }));

export const PROPS: readonly PropInstance[] = [
  // 좌측: 대회의실, 소회의실, 프로젝트 스튜디오
  { kind: 'meeting_table', x: 8, y: 8, block: { w: 5, h: 3 }, tag: 'BOARD ROOM' },
  { kind: 'whiteboard', x: 3, y: 3, block: { w: 2, h: 1 } },
  { kind: 'plant', x: 14, y: 3 },
  { kind: 'long_table', x: 8, y: 19, block: { w: 7, h: 2 }, tag: 'HUDDLE' },
  { kind: 'whiteboard', x: 3, y: 15, block: { w: 2, h: 1 } },
  { kind: 'plant', x: 14, y: 21 },
  { kind: 'cluster_desk', x: 8, y: 32, block: { w: 4, h: 3 }, tag: 'PROJECT' },
  { kind: 'bookshelf', x: 3, y: 28, block: { w: 2, h: 1 } },
  { kind: 'whiteboard', x: 13, y: 28, block: { w: 2, h: 1 } },
  { kind: 'sofa', x: 5, y: 37, block: { w: 3, h: 1 } },
  { kind: 'printer', x: 13, y: 37, block: { w: 1, h: 1 } },

  // 중앙 상단: 임원·운영 데스크
  { kind: 'desk', x: 32, y: 4, block: { w: 3, h: 1 }, tag: 'EXECUTIVE' },
  { kind: 'workstation', x: 28, y: 4, block: { w: 2, h: 1 } },
  { kind: 'workstation', x: 36, y: 4, block: { w: 2, h: 1 } },
  { kind: 'whiteboard', x: 21, y: 3, block: { w: 2, h: 1 } },
  { kind: 'bookshelf', x: 43, y: 3, block: { w: 2, h: 1 } },
  { kind: 'plant', x: 19, y: 6 },
  { kind: 'plant', x: 45, y: 6 },

  // 중앙: 6개 팀, 18개의 실제 워크스테이션
  ...TEAM_WORKSTATIONS,
  { kind: 'partition', x: 27, y: 18, block: { w: 2, h: 1 } },
  { kind: 'partition', x: 36, y: 18, block: { w: 2, h: 1 } },
  { kind: 'partition', x: 27, y: 29, block: { w: 2, h: 1 } },
  { kind: 'partition', x: 36, y: 29, block: { w: 2, h: 1 } },
  { kind: 'printer', x: 19, y: 30, block: { w: 1, h: 1 } },
  { kind: 'server_rack', x: 44, y: 30, block: { w: 1, h: 1 } },

  // 우측: 쇼케이스, 카페, 포커스 라운지
  { kind: 'round_table', x: 54, y: 6, block: { w: 3, h: 2 }, tag: 'SHOWCASE' },
  { kind: 'lamp', x: 50, y: 7 },
  { kind: 'plant', x: 59, y: 7 },
  { kind: 'cooler', x: 50, y: 13, block: { w: 1, h: 1 } },
  { kind: 'bookshelf', x: 57, y: 13, block: { w: 2, h: 1 } },
  { kind: 'round_table', x: 54, y: 17, block: { w: 3, h: 2 }, tag: 'CAFE' },
  { kind: 'coffee_table', x: 54, y: 21, block: { w: 2, h: 1 } },
  { kind: 'plant', x: 59, y: 21 },
  { kind: 'sofa', x: 53, y: 29, block: { w: 3, h: 1 } },
  { kind: 'coffee_table', x: 56, y: 33, block: { w: 2, h: 1 } },
  { kind: 'sofa', x: 56, y: 37, block: { w: 3, h: 1 } },
  { kind: 'plant', x: 49, y: 37 },
  { kind: 'lamp', x: 59, y: 27 },

  // 하단: 메인 로비와 출입구
  { kind: 'door_mat', x: 32, y: 38 },
  { kind: 'plant', x: 21, y: 37 },
  { kind: 'plant', x: 24, y: 37 },
  { kind: 'plant', x: 40, y: 37 },
  { kind: 'plant', x: 43, y: 37 },
  { kind: 'cooler', x: 45, y: 35, block: { w: 1, h: 1 } },
];

export type CellKind = 'wall' | 'floor' | 'glass';
export type FloorKind = 'tile' | 'wood';

export interface MapGrid {
  cells: CellKind[][];
  floor: FloorKind[][];
  zoneAt: (Zone | null)[][];
  blocked: boolean[][];
}

function carveRect(
  cells: CellKind[][],
  floor: FloorKind[][],
  rect: { x: number; y: number; w: number; h: number },
  floorKind: FloorKind = 'wood',
): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (cells[y]) cells[y]![x] = 'floor';
      if (floor[y]) floor[y]![x] = floorKind;
    }
  }
}

function carveSideDoors(cells: CellKind[][], floor: FloorKind[][]): void {
  for (const zone of ZONES) {
    if (zone.x === LEFT_X) {
      const midY = zone.y + Math.floor(zone.h / 2);
      carveRect(cells, floor, { x: LEFT_X + LEFT_W - 1, y: midY, w: MAIN_X - (LEFT_X + LEFT_W) + 2, h: 2 });
    }
    if (zone.x === RIGHT_X) {
      const midY = zone.y + Math.floor(zone.h / 2);
      carveRect(cells, floor, { x: MAIN_X + MAIN_W - 1, y: midY, w: RIGHT_X - (MAIN_X + MAIN_W) + 2, h: 2 });
    }
  }
}

export function buildGrid(): MapGrid {
  const cells: CellKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): CellKind => 'wall'),
  );
  const floor: FloorKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): FloorKind => 'tile'),
  );
  const zoneAt: (Zone | null)[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): Zone | null => null),
  );

  for (const zone of ZONES) {
    carveRect(cells, floor, zone, 'wood');
    for (let y = zone.y; y < zone.y + zone.h; y++) {
      for (let x = zone.x; x < zone.x + zone.w; x++) {
        if (zoneAt[y]) zoneAt[y]![x] = zone;
      }
    }
  }

  // 부서 사이의 벽을 없애 하나의 큰 오픈 오피스로 보이게 한다.
  carveRect(cells, floor, { x: MAIN_X, y: 1, w: MAIN_W, h: MAP_ROWS - 2 });
  carveSideDoors(cells, floor);

  const blocked: boolean[][] = cells.map((row) =>
    row.map((cell) => cell === 'wall' || cell === 'glass'),
  );

  for (const prop of PROPS) {
    if (!prop.block) continue;
    const halfW = Math.floor(prop.block.w / 2);
    for (let dy = 0; dy < prop.block.h; dy++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        const row = blocked[prop.y - dy];
        const x = prop.x + dx;
        if (row && x > 0 && x < MAP_COLS - 1) row[x] = true;
      }
    }
  }

  for (const seat of [
    ...DEPARTMENT_ZONES.map((zone) => zone.seat!),
    ...MEETING_SEATS,
    ...STAFF_SEAT_POINTS,
    SPAWN,
  ]) {
    if (blocked[seat.y]) blocked[seat.y]![seat.x] = false;
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

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBORS = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;

export function findPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  maxNodes = 5000,
): Array<{ x: number; y: number }> {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const goal = { x: Math.round(to.x), y: Math.round(to.y) };

  if (isBlocked(goal.x, goal.y)) return [];
  if (start.x === goal.x && start.y === goal.y) return [];

  const key = (x: number, y: number): number => y * MAP_COLS + x;
  const heuristic = (x: number, y: number): number => Math.hypot(goal.x - x, goal.y - y);
  const open: Node[] = [
    { x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y), parent: null },
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
      const path: Array<{ x: number; y: number }> = [];
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
      if (dx !== 0 && dy !== 0 && (isBlocked(current.x + dx, current.y) || isBlocked(current.x, current.y + dy))) continue;

      const g = current.g + (dx !== 0 && dy !== 0 ? 1.414 : 1);
      const nodeKey = key(nx, ny);
      if (g >= (best.get(nodeKey) ?? Infinity)) continue;

      best.set(nodeKey, g);
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny), parent: current });
    }
  }

  return [];
}
