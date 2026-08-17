import type { AgentId } from '@shared';
import { STAFF_SEAT_POINTS } from './office-staff';

export const TILE = 32;
export const MAP_COLS = 52;
export const MAP_ROWS = 30;
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

/**
 * 디자인 기준 이미지(1672×941)를 52×30 타일로 옮긴 플랜.
 * 큰 방 네 곳과 중앙의 작은 협업실, 하단 쇼케이스·라운지·카페 구조를 그대로 쓴다.
 */
export const ZONES: readonly Zone[] = [
  { id: 'researcher', label: '리서치', kind: 'department', x: 1, y: 1, w: 19, h: 9, color: '#76679a', agent: 'researcher', seat: { x: 9, y: 7 }, rug: false },
  { id: 'reception', label: '대표 집무실', kind: 'reception', x: 21, y: 1, w: 12, h: 9, color: '#aa7b37', agent: 'chief', seat: { x: 27, y: 7 }, rug: false },
  { id: 'boardroom', label: '대회의실', kind: 'meeting', x: 34, y: 1, w: 17, h: 9, color: '#657b98', rug: false },
  { id: 'dev', label: '개발', kind: 'department', x: 1, y: 11, w: 14, h: 8, color: '#3f857d', agent: 'dev', seat: { x: 8, y: 17 }, rug: false },
  { id: 'finance', label: '재무', kind: 'department', x: 16, y: 14, w: 7, h: 6, color: '#63727c', agent: 'finance', seat: { x: 19, y: 18 }, rug: false },
  { id: 'writer', label: '문서', kind: 'department', x: 29, y: 14, w: 7, h: 6, color: '#6f8ea3', agent: 'writer', seat: { x: 32, y: 18 }, rug: false },
  { id: 'marketer', label: '마케팅', kind: 'department', x: 37, y: 11, w: 14, h: 8, color: '#ad6471', agent: 'marketer', seat: { x: 44, y: 17 }, rug: false },
  { id: 'planner', label: '기획', kind: 'department', x: 1, y: 21, w: 12, h: 8, color: '#527da0', agent: 'planner', seat: { x: 7, y: 27 }, rug: false },
  { id: 'showcase', label: '쇼케이스', kind: 'lounge', x: 13, y: 21, w: 11, h: 8, color: '#9b733d', rug: false },
  { id: 'entrance', label: '메인 로비', kind: 'entrance', x: 24, y: 21, w: 5, h: 8, color: '#707d8e', rug: false, showLabel: false },
  { id: 'focus-lounge', label: '포커스 라운지', kind: 'lounge', x: 29, y: 21, w: 10, h: 8, color: '#657b91', rug: false },
  { id: 'cafe', label: '오피스 카페', kind: 'cafe', x: 39, y: 21, w: 12, h: 8, color: '#70866d', rug: false },
];

export const DEPARTMENT_ZONES = ZONES.filter((zone) => zone.agent);
export const SPAWN = { x: 26, y: 28 };

const MEETING = ZONES.find((zone) => zone.id === 'boardroom')!;

export const MEETING_SEATS: ReadonlyArray<{ x: number; y: number }> = [
  { x: MEETING.x + 3, y: MEETING.y + 4 }, { x: MEETING.x + 6, y: MEETING.y + 3 },
  { x: MEETING.x + 9, y: MEETING.y + 3 }, { x: MEETING.x + 12, y: MEETING.y + 4 },
  { x: MEETING.x + 13, y: MEETING.y + 7 }, { x: MEETING.x + 10, y: MEETING.y + 8 },
  { x: MEETING.x + 7, y: MEETING.y + 8 }, { x: MEETING.x + 4, y: MEETING.y + 8 },
  { x: MEETING.x + 2, y: MEETING.y + 7 },
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
        if (zoneAt[y]) zoneAt[y]![x] = zone;
      }
    }
  }

  const blocked: boolean[][] = cells.map((row) =>
    row.map((cell) => cell === 'wall' || cell === 'glass'),
  );

  // 기준 이미지 속 큰 가구만 충돌 영역으로 잡습니다. 방 벽은 넓은 통로를
  // 남기고 느슨하게 막아, Gather처럼 클릭 이동이 답답하지 않게 합니다.
  const blockers = [
    { x: 3, y: 5, w: 11, h: 2 },   // 리서치 테이블
    { x: 23, y: 5, w: 8, h: 2 },   // 대표 데스크
    { x: 37, y: 4, w: 12, h: 3 },  // 대회의실 테이블
    { x: 3, y: 15, w: 9, h: 2 },   // 개발 테이블
    { x: 40, y: 15, w: 9, h: 2 },  // 마케팅 테이블
    { x: 3, y: 25, w: 8, h: 2 },   // 기획 테이블
    { x: 41, y: 22, w: 9, h: 2 },  // 카페 카운터
    { x: 16, y: 23, w: 7, h: 4 },  // 쇼케이스 진열장
  ];
  for (const rect of blockers) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (blocked[y]) blocked[y]![x] = true;
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
