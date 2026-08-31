# 사무실 배경 코드 변환 + 구조 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 `office-v2.png` 배경 대신, 빌드타임 스크립트가 `tiles.png`/`props.png`(이미 절차적으로 생성되지만 안 쓰이던 에셋)를 조합해 만드는 `office-v3.png`를 쓰고, 그 위에 82×34 크기의 새 82×34 사무실 레이아웃(디자인팀 전용 방 포함, 대표실을 비서실·대회의실 사이·중앙 라운지 바로 위에 배치)을 얹는다.

**Architecture:** `Frontend/tools/generate_office.mjs`(신규)가 `office-map.json` + `office-props.json`(신규)을 읽어 `tiles.png`/`props.png`를 blit해 `public/map/office-v3.png`를 만든다. 런타임 `office-renderer.ts`의 `drawFloor()`는 그 이미지를 지금처럼 한 번 그리기만 한다 — 문·존톤 등 런타임 연출은 변경 없음. 좌석/문/충돌 데이터는 새 레이아웃에 맞게 전면 교체하고, 하드코딩돼 있던 휴게·잡담 스팟은 존 데이터에서 동적으로 계산하도록 바꾼다.

**Tech Stack:** Node.js + `@napi-rs/canvas`(생성 스크립트, 기존 `generate_sprites.mjs`/`build_reference_characters.mjs`와 동일), TypeScript + Canvas2D(런타임), 기존 `validate_office_map.mjs` 검증기.

**Spec:** `docs/superpowers/specs/2026-08-31-office-layout-code-conversion-design.md`

## Global Constraints

- `TILE = 32`px 유지.
- 맵 크기 **82×34** 타일.
- 런타임 렌더링 로직(`office-renderer.ts`의 `drawFloor`/`drawDoors`/존톤 등)은 배경 이미지 경로 교체 + 휴게 스팟 동적화 외에는 바꾸지 않는다.
- 문(door)은 생성 스크립트가 그리지 않는다 — 런타임이 항상 그 위에 얹는다(문 위치엔 벽을 그리지 않고 바닥만 남긴다).
- 좌석 좌표는 `office-map.json`(부서장) / `office-staff.ts`(팀원) 두 곳에 나뉘어 있는 기존 구조를 유지한다.
- 모든 방은 문이 최소 1개 있어야 하고(로비는 2개), `validate_office_map.mjs`의 스폰→모든 문 BFS 도달성 검사를 통과해야 한다.

---

## Task 1: `office-map.json` — 새 82×34 레이아웃

**Files:**
- Modify: `Frontend/src/data/office-map.json` (전체 교체)

**Interfaces:**
- Produces: `zones[]`(13개, id 목록: researcher, reception, ceo-office, boardroom, dev, finance, writer, marketer, planner, designer, entrance, showcase, cafe), `doors[]`(14개), `meetingSeats[]`(9개), `collisionBlockers[]`(13개), `spawn`, `ceoSeat`. 이후 모든 Task가 이 좌표를 기준으로 삼는다.

- [ ] **Step 1: `office-map.json` 새 내용으로 교체**

```json
{
  "version": 1,
  "tileSize": 32,
  "cols": 82,
  "rows": 34,
  "spawn": { "x": 42, "y": 31 },
  "ceoSeat": { "x": 44, "y": 3 },
  "zones": [
    { "id": "researcher", "label": "리서치", "kind": "department", "x": 1, "y": 1, "w": 20, "h": 9, "color": "#76679a", "agent": "researcher", "seat": { "x": 11, "y": 4 }, "rug": false },
    { "id": "reception", "label": "비서실", "kind": "reception", "x": 22, "y": 1, "w": 14, "h": 9, "color": "#aa7b37", "agent": "chief", "seat": { "x": 29, "y": 4 }, "rug": false },
    { "id": "ceo-office", "label": "대표실", "kind": "reception", "x": 37, "y": 1, "w": 14, "h": 9, "color": "#657b91", "rug": false },
    { "id": "boardroom", "label": "대회의실", "kind": "meeting", "x": 52, "y": 1, "w": 29, "h": 9, "color": "#657b98", "rug": false },
    { "id": "dev", "label": "개발", "kind": "department", "x": 1, "y": 12, "w": 16, "h": 9, "color": "#3f857d", "agent": "dev", "seat": { "x": 9, "y": 15 }, "rug": false },
    { "id": "finance", "label": "재무", "kind": "department", "x": 18, "y": 12, "w": 13, "h": 9, "color": "#63727c", "agent": "finance", "seat": { "x": 25, "y": 15 }, "rug": false },
    { "id": "writer", "label": "문서", "kind": "department", "x": 51, "y": 12, "w": 13, "h": 9, "color": "#6f8ea3", "agent": "writer", "seat": { "x": 58, "y": 15 }, "rug": false },
    { "id": "marketer", "label": "마케팅", "kind": "department", "x": 65, "y": 12, "w": 16, "h": 9, "color": "#ad6471", "agent": "marketer", "seat": { "x": 73, "y": 15 }, "rug": false },
    { "id": "planner", "label": "기획", "kind": "department", "x": 1, "y": 24, "w": 16, "h": 9, "color": "#527da0", "agent": "planner", "seat": { "x": 9, "y": 31 }, "rug": false },
    { "id": "designer", "label": "디자인", "kind": "department", "x": 18, "y": 24, "w": 16, "h": 9, "color": "#c9578b", "agent": "designer", "seat": { "x": 26, "y": 31 }, "rug": false },
    { "id": "entrance", "label": "메인 로비", "kind": "entrance", "x": 35, "y": 24, "w": 14, "h": 9, "color": "#707d8e", "rug": false, "showLabel": false },
    { "id": "showcase", "label": "쇼케이스", "kind": "lounge", "x": 50, "y": 24, "w": 14, "h": 9, "color": "#9b733d", "rug": false },
    { "id": "cafe", "label": "오피스 카페", "kind": "cafe", "x": 65, "y": 24, "w": 16, "h": 9, "color": "#70866d", "rug": false }
  ],
  "doors": [
    { "zoneId": "researcher", "x": 11, "y": 9 },
    { "zoneId": "reception", "x": 29, "y": 9 },
    { "zoneId": "ceo-office", "x": 44, "y": 9 },
    { "zoneId": "boardroom", "x": 66, "y": 9 },
    { "zoneId": "dev", "x": 9, "y": 20 },
    { "zoneId": "finance", "x": 25, "y": 20 },
    { "zoneId": "writer", "x": 58, "y": 20 },
    { "zoneId": "marketer", "x": 73, "y": 20 },
    { "zoneId": "planner", "x": 9, "y": 24 },
    { "zoneId": "designer", "x": 26, "y": 24 },
    { "zoneId": "entrance", "x": 42, "y": 24 },
    { "zoneId": "entrance", "x": 42, "y": 32 },
    { "zoneId": "showcase", "x": 57, "y": 24 },
    { "zoneId": "cafe", "x": 73, "y": 24 }
  ],
  "meetingSeats": [
    { "x": 64, "y": 3 }, { "x": 66, "y": 3 }, { "x": 68, "y": 3 },
    { "x": 64, "y": 7 }, { "x": 66, "y": 7 }, { "x": 68, "y": 7 },
    { "x": 63, "y": 5 }, { "x": 69, "y": 5 }, { "x": 66, "y": 2 }
  ],
  "collisionBlockers": [
    { "x": 3, "y": 3, "w": 16, "h": 1 },
    { "x": 24, "y": 3, "w": 10, "h": 1 },
    { "x": 43, "y": 2, "w": 2, "h": 1 },
    { "x": 64, "y": 4, "w": 5, "h": 3 },
    { "x": 3, "y": 14, "w": 12, "h": 1 },
    { "x": 20, "y": 14, "w": 9, "h": 1 },
    { "x": 37, "y": 14, "w": 8, "h": 5 },
    { "x": 53, "y": 14, "w": 9, "h": 1 },
    { "x": 67, "y": 14, "w": 12, "h": 1 },
    { "x": 3, "y": 30, "w": 12, "h": 1 },
    { "x": 20, "y": 30, "w": 12, "h": 1 },
    { "x": 53, "y": 29, "w": 8, "h": 2 },
    { "x": 68, "y": 29, "w": 9, "h": 2 }
  ]
}
```

- [ ] **Step 2: 검증 실행**

Run: `npm --workspace @ai-company/frontend run map:validate`
Expected: `office-map.json valid: 82x34, 13 zones` (실패하면 어느 문이 스폰에서 도달 불가능한지 에러 메시지에 나온다 — 위 좌표를 다시 확인)

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/data/office-map.json
git commit -m "feat(office): 82x34 새 사무실 레이아웃 데이터로 교체"
```

---

## Task 2: `office-staff.ts` — 새 팀원 좌석

**Files:**
- Modify: `Frontend/src/components/office/office-staff.ts` (전체 교체)

**Interfaces:**
- Consumes: Task 1의 zone 좌표 (좌석이 각 부서 방 안에 들어오는지 육안 확인 기준)
- Produces: `STAFF_SEATS`(16개, 부서장은 이제 전부 `zones[].seat`를 쓰므로 `designer` 단독 항목은 제거), `STAFF_SEAT_MAP`, `STAFF_SEAT_POINTS`, `SPRITE_OF`, `OFFICE_HEADCOUNT` — 시그니처는 기존과 동일.

- [ ] **Step 1: 파일 전체 교체**

```typescript
import type { AgentId } from '@shared';

/**
 * 팀원 좌석표.
 *
 * 이제 이들은 장식용 NPC 가 아니라 **실제로 일하는 AI 직원**입니다.
 * (백엔드 `agents.seed.ts` 에 같은 id 로 등록되어 있습니다)
 * 여기서는 화면상 어디에 앉는지만 정의합니다.
 *
 * 스프라이트는 소속 부서 팀장과 같은 외형을 씁니다.
 */
export interface OfficeStaffSeat {
  id: AgentId;
  /** 스프라이트 시트 행 — 소속 부서 팀장과 동일 외형 */
  sprite: AgentId;
  seat: { x: number; y: number };
  facing?: 'down' | 'left' | 'right' | 'up';
}

/**
 * 부서별 팀원 좌석 (팀장 좌석은 `office-map.json` 의 `ZONES[].seat`).
 * 모든 좌석은 데스크(북쪽 한 칸)를 보고 앉으므로 `facing: 'up'` 입니다 —
 * `office-renderer.ts` 가 업무 중엔 항상 'up' 으로 덮어쓰기 때문에 실제로는
 * 유휴 상태일 때만 쓰이는 값입니다.
 */
export const STAFF_SEATS: readonly OfficeStaffSeat[] = [
  // ── 비서실
  { id: 'chief-senior', sprite: 'chief', seat: { x: 26, y: 4 }, facing: 'up' },
  { id: 'chief-junior', sprite: 'chief', seat: { x: 33, y: 4 }, facing: 'up' },

  // ── 리서치팀
  { id: 'researcher-senior', sprite: 'researcher', seat: { x: 6, y: 4 }, facing: 'up' },
  { id: 'researcher-junior', sprite: 'researcher', seat: { x: 16, y: 4 }, facing: 'up' },

  // ── 개발팀
  { id: 'dev-senior', sprite: 'dev', seat: { x: 5, y: 15 }, facing: 'up' },
  { id: 'dev-junior', sprite: 'dev', seat: { x: 13, y: 15 }, facing: 'up' },

  // ── 기획팀
  { id: 'planner-senior', sprite: 'planner', seat: { x: 5, y: 31 }, facing: 'up' },
  { id: 'planner-junior', sprite: 'planner', seat: { x: 13, y: 31 }, facing: 'up' },

  // ── 문서팀
  { id: 'writer-senior', sprite: 'writer', seat: { x: 54, y: 15 }, facing: 'up' },
  { id: 'writer-junior', sprite: 'writer', seat: { x: 61, y: 15 }, facing: 'up' },

  // ── 마케팅팀
  { id: 'marketer-senior', sprite: 'marketer', seat: { x: 69, y: 15 }, facing: 'up' },
  { id: 'marketer-junior', sprite: 'marketer', seat: { x: 77, y: 15 }, facing: 'up' },

  // ── 재무팀
  { id: 'finance-senior', sprite: 'finance', seat: { x: 21, y: 15 }, facing: 'up' },
  { id: 'finance-junior', sprite: 'finance', seat: { x: 28, y: 15 }, facing: 'up' },

  // ── 디자인팀 (이제 전용 방이 있습니다 — 팀장 좌석은 zones[].seat)
  { id: 'designer-senior', sprite: 'designer', seat: { x: 22, y: 31 }, facing: 'up' },
  { id: 'designer-junior', sprite: 'designer', seat: { x: 30, y: 31 }, facing: 'up' },
];

/** id → 좌석 (렌더러가 백엔드 직원 목록과 맞출 때 씁니다) */
export const STAFF_SEAT_MAP = new Map<AgentId, OfficeStaffSeat>(
  STAFF_SEATS.map((s) => [s.id, s]),
);

/** 좌석 좌표만 (충돌 격자에서 "설 수 있는 칸"으로 뚫을 때 씁니다) */
export const STAFF_SEAT_POINTS: ReadonlyArray<{ x: number; y: number }> =
  STAFF_SEATS.map((s) => s.seat);

/** 팀장 8명 + 팀원 16명 */
export const OFFICE_HEADCOUNT = 8 + STAFF_SEATS.length;

/** 팀장과 외형을 공유하기 위한 스프라이트 매핑 */
export const SPRITE_OF = new Map<AgentId, AgentId>(
  STAFF_SEATS.map((s) => [s.id, s.sprite]),
);
```

- [ ] **Step 2: 타입 체크**

Run: `cd Frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/components/office/office-staff.ts
git commit -m "feat(office): 새 레이아웃에 맞춰 팀원 좌석 재배치, 디자인팀 전용 방 반영"
```

---

## Task 3: `office-map.ts` — 라운지 경계 상수 추가

**Files:**
- Modify: `Frontend/src/components/office/office-map.ts:56-62` 부근 (기존 `MEETING_SEATS` export 바로 아래)

**Interfaces:**
- Consumes: 없음 (하드코딩된 좌표 하나)
- Produces: `LOUNGE_BOUNDS: Readonly<{ x: number; y: number; w: number; h: number }>` — Task 4가 이 존을 걸을 수 있는 지점 탐색 범위로 쓴다.

- [ ] **Step 1: `MEETING_SEATS` export 다음 줄에 추가**

```typescript
export const MEETING_SEATS: ReadonlyArray<Point> = MAP.meetingSeats;

/**
 * 중앙 라운지(소파·안락의자) 범위 — 정식 zone 이 아닙니다(벽·문이 없는
 * 열린 통로 위 장식 구역). `office-props.json` 의 라운지 가구, 그리고
 * `office-renderer.ts` 의 휴게·잡담 스팟 계산이 이 경계를 씁니다.
 */
export const LOUNGE_BOUNDS: Readonly<{ x: number; y: number; w: number; h: number }> = {
  x: 32, y: 12, w: 18, h: 9,
};
```

- [ ] **Step 2: 타입 체크**

Run: `cd Frontend && npx tsc --noEmit`
Expected: 에러 없음 (아직 아무도 `LOUNGE_BOUNDS` 를 안 써도 export 되지 않은 변수 경고는 나지 않는다 — TS 는 미사용 export 를 에러로 보지 않는다)

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/components/office/office-map.ts
git commit -m "feat(office): 라운지 경계 상수(LOUNGE_BOUNDS) 추가"
```

---

## Task 4: `office-renderer.ts` — 휴게·잡담 스팟 존 기반 동적 계산

**Files:**
- Modify: `Frontend/src/components/office/office-renderer.ts:1-65` 부근 (import 구문 및 `LEISURE_POINTS`/`CHAT_SPOTS` 상수 선언부)

**Interfaces:**
- Consumes: `ZONES`, `isBlocked` (이미 import 돼 있음), `LOUNGE_BOUNDS`(신규, `./office-map` 에서 import 추가)
- Produces: `LEISURE_POINTS`, `CHAT_SPOTS` — **타입·용도는 기존과 동일** (각각 `pickLeisure()`, `updateAmbientConversation()` 에서 이미 쓰는 코드는 손대지 않는다). `LEISURE_POINTS` 항목 개수가 0개일 수 있는 이론적 가능성을 없애기 위해 `pickLeisure`/잡담 로직이 빈 배열이어도 안전한지 확인한다(기존 코드가 이미 `spot` null 체크를 하므로 안전).

- [ ] **Step 1: import 에 `LOUNGE_BOUNDS` 추가**

`Frontend/src/components/office/office-renderer.ts` 상단의 기존 import 블록:

```typescript
import {
  MAP_H,
  MAP_W,
  CEO_SEAT,
  DOORS,
  SPAWN,
  TILE,
  ZONES,
  MEETING_SEATS,
  findPath,
  isBlocked,
  nearestWalkable,
  zoneAt,
} from './office-map';
```

를 아래로 교체:

```typescript
import {
  MAP_H,
  MAP_W,
  CEO_SEAT,
  DOORS,
  SPAWN,
  TILE,
  ZONES,
  MEETING_SEATS,
  LOUNGE_BOUNDS,
  findPath,
  isBlocked,
  nearestWalkable,
  zoneAt,
} from './office-map';
```

- [ ] **Step 2: `LEISURE_POINTS`/`CHAT_SPOTS` 하드코딩을 동적 계산으로 교체**

기존 (파일 상단 근처):

```typescript
type LeisureKind = 'cafe' | 'lounge';

/**
 * 대기 직원이 잠깐 다녀오는 휴게 지점 (타일 좌표).
 * 카페·포커스 라운지·프로젝트 스튜디오 언저리의 빈 바닥입니다.
 * kind 는 어떤 연출(카페 김 파티클 등)을 붙일지 구분하는 데 씁니다.
 */
const LEISURE_POINTS: ReadonlyArray<{ x: number; y: number; kind: LeisureKind }> = [
  { x: 42, y: 26, kind: 'cafe' }, { x: 47, y: 26, kind: 'cafe' }, // 카페
  { x: 25, y: 12, kind: 'lounge' }, { x: 28, y: 12, kind: 'lounge' }, // 중앙 라운지
];

/** 배회 결정 간격 (ms) — 너무 잦으면 오피스가 산만해집니다 */
const CHAT_SPOTS = [
  [{ x: 42, y: 26 }, { x: 44, y: 26 }],
  [{ x: 25, y: 12 }, { x: 27, y: 12 }],
] as const;
```

를 아래로 교체:

```typescript
type LeisureKind = 'cafe' | 'lounge';

interface TileBounds { x: number; y: number; w: number; h: number; }

/**
 * 주어진 범위 안에서 걸을 수 있는 타일을 찾아 `count` 개를 고릅니다.
 * 레이아웃이 바뀌어도(맵 확장·방 재배치) 이 함수만 다시 실행되면 되므로,
 * 카페·라운지 좌표를 손으로 다시 잡을 필요가 없습니다.
 */
function walkablePointsIn(bounds: TileBounds, count: number): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = bounds.y + 1; y < bounds.y + bounds.h - 1; y++) {
    for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x++) {
      if (!isBlocked(x, y)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return [];

  const step = Math.max(1, Math.floor(candidates.length / count));
  const picked: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < candidates.length && picked.length < count; i += step) {
    const point = candidates[i];
    if (point) picked.push(point);
  }
  return picked;
}

const cafeZone = ZONES.find((zone) => zone.kind === 'cafe');
const CAFE_LEISURE_POINTS = cafeZone ? walkablePointsIn(cafeZone, 2) : [];
const LOUNGE_LEISURE_POINTS = walkablePointsIn(LOUNGE_BOUNDS, 2);

/**
 * 대기 직원이 잠깐 다녀오는 휴게 지점 (타일 좌표).
 * 카페 존(kind === 'cafe')과 중앙 라운지 범위(`LOUNGE_BOUNDS`) 안에서
 * 걸을 수 있는 타일을 동적으로 골라 씁니다. kind 는 어떤 연출(카페 김
 * 파티클 등)을 붙일지 구분하는 데 씁니다.
 */
const LEISURE_POINTS: ReadonlyArray<{ x: number; y: number; kind: LeisureKind }> = [
  ...CAFE_LEISURE_POINTS.map((point) => ({ ...point, kind: 'cafe' as const })),
  ...LOUNGE_LEISURE_POINTS.map((point) => ({ ...point, kind: 'lounge' as const })),
];

/** 잡담 스팟 — 카페·라운지 각각에서 나란한 두 지점을 한 쌍으로 씁니다 */
const CHAT_SPOTS: ReadonlyArray<readonly [{ x: number; y: number }, { x: number; y: number }]> =
  [CAFE_LEISURE_POINTS, LOUNGE_LEISURE_POINTS]
    .filter((pair): pair is [{ x: number; y: number }, { x: number; y: number }] => pair.length === 2);
```

- [ ] **Step 3: 타입 체크**

Run: `cd Frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add Frontend/src/components/office/office-renderer.ts
git commit -m "refactor(office): 휴게/잡담 스팟을 존 데이터 기반 동적 계산으로 전환"
```

---

## Task 5: `office-props.json` — 장식 가구 데이터

**Files:**
- Create: `Frontend/src/data/office-props.json`

**Interfaces:**
- Produces: `{ items: Array<{ type: string; x: number; y: number }> }` — `type` 은 `Frontend/public/sprites/manifest.json` 의 `props` 키(`plant`, `bookshelf`, `sofa`, `chair`, `coffee_table`, `meeting_table`, `long_table`, `round_table`) 중 하나. `x,y` 는 소품의 **중심** 타일 좌표. Task 6(생성 스크립트)이 이 파일을 읽어 그린다.

- [ ] **Step 1: 파일 작성**

```json
{
  "items": [
    { "type": "plant", "x": 3, "y": 7 },
    { "type": "plant", "x": 24, "y": 7 },
    { "type": "plant", "x": 39, "y": 7 },
    { "type": "bookshelf", "x": 66, "y": 3 },

    { "type": "plant", "x": 3, "y": 18 },
    { "type": "plant", "x": 20, "y": 18 },
    { "type": "plant", "x": 53, "y": 18 },
    { "type": "plant", "x": 67, "y": 18 },

    { "type": "sofa", "x": 40, "y": 16 },
    { "type": "chair", "x": 36, "y": 17 },
    { "type": "chair", "x": 44, "y": 17 },
    { "type": "coffee_table", "x": 40, "y": 18 },

    { "type": "plant", "x": 3, "y": 29 },
    { "type": "plant", "x": 20, "y": 29 },

    { "type": "bookshelf", "x": 54, "y": 30 },
    { "type": "bookshelf", "x": 59, "y": 30 },

    { "type": "long_table", "x": 72, "y": 30 },
    { "type": "round_table", "x": 68, "y": 27 },
    { "type": "round_table", "x": 77, "y": 27 },
    { "type": "plant", "x": 79, "y": 25 }
  ]
}
```

- [ ] **Step 2: JSON 유효성 확인**

Run: `node -e "JSON.parse(require('fs').readFileSync('Frontend/src/data/office-props.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/data/office-props.json
git commit -m "feat(office): 방별 장식 가구(화분·소파·책장 등) 좌표 데이터 추가"
```

---

## Task 6: `generate_office.mjs` — 배경 생성 스크립트

**Files:**
- Create: `Frontend/tools/generate_office.mjs`

**Interfaces:**
- Consumes: `Frontend/src/data/office-map.json`, `Frontend/src/data/office-props.json`, `Frontend/public/sprites/manifest.json`, `Frontend/public/sprites/tiles.png`, `Frontend/public/sprites/props.png` (모두 Task 1/5 및 기존 `npm run sprites` 산출물)
- Produces: `Frontend/public/map/office-v3.png` (`MAP_COLS*32 × MAP_ROWS*32` px)

- [ ] **Step 1: 스크립트 작성**

```javascript
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
```

- [ ] **Step 2: `office-props.json` 에 팀원 좌석 사본 추가**

Node 스크립트는 TypeScript(`office-staff.ts`)를 직접 읽을 수 없으므로, 자동 책상 배치를 위해 좌표 사본을 `office-props.json` 에 둔다. Task 5에서 만든 파일을 열어 최상위에 `staffSeats` 배열을 추가한다 (Task 2의 `STAFF_SEATS` 와 좌표가 정확히 같아야 한다 — 새 팀원이 추가될 때마다 두 파일을 함께 고친다는 뜻이며, 이는 이번 설계의 알려진 트레이드오프다):

```json
{
  "staffSeats": [
    { "x": 26, "y": 4 }, { "x": 33, "y": 4 },
    { "x": 6, "y": 4 }, { "x": 16, "y": 4 },
    { "x": 5, "y": 15 }, { "x": 13, "y": 15 },
    { "x": 5, "y": 31 }, { "x": 13, "y": 31 },
    { "x": 54, "y": 15 }, { "x": 61, "y": 15 },
    { "x": 69, "y": 15 }, { "x": 77, "y": 15 },
    { "x": 21, "y": 15 }, { "x": 28, "y": 15 },
    { "x": 22, "y": 31 }, { "x": 30, "y": 31 }
  ],
  "items": [ … Step 1의 items 배열을 그대로 이어붙인다 … ]
}
```

(에디터로 Task 5에서 만든 파일의 `{` 바로 뒤에 `"staffSeats": [...],` 를 삽입하면 된다.)

- [ ] **Step 3: 실행해 이미지 생성**

Run:
```bash
cd Frontend && node tools/generate_office.mjs
```
Expected: `office-v3.png 2624x1088 → .../public/map/office-v3.png` 출력, 파일이 실제로 생성됨(`ls Frontend/public/map/office-v3.png`).

- [ ] **Step 4: 이미지 크기 확인**

Run: `cd Frontend && node -e "const {loadImage}=require('@napi-rs/canvas'); loadImage('public/map/office-v3.png').then(i=>console.log(i.width,i.height))"`
Expected: `2624 1088` (= 82*32, 34*32)

- [ ] **Step 5: Commit**

```bash
git add Frontend/tools/generate_office.mjs Frontend/src/data/office-props.json Frontend/public/map/office-v3.png
git commit -m "feat(office): 타일/프롭 조합 배경 생성 스크립트 추가, office-v3.png 생성"
```

---

## Task 7: 런타임 연결 — 새 배경 이미지 사용 + npm 스크립트 + 문서

**Files:**
- Modify: `Frontend/src/components/office/sprites.ts:60`
- Modify: `Frontend/package.json`
- Modify: `docs/OPERATIONS.md`

**Interfaces:**
- Consumes: Task 6이 만든 `public/map/office-v3.png`
- Produces: `loadSpriteAssets()` 가 새 이미지를 불러온다 (반환 타입 변경 없음)

- [ ] **Step 1: `sprites.ts` 의 배경 경로 교체**

`Frontend/src/components/office/sprites.ts:60`:

```typescript
    loadImage('/map/office-v2.png'),
```

를:

```typescript
    loadImage('/map/office-v3.png'),
```

로 교체한다. (기존 `office-v2.png` 파일은 지우지 않고 그대로 둔다 — 필요하면 되돌릴 수 있게.)

- [ ] **Step 2: `package.json` 에 생성 스크립트 추가**

`Frontend/package.json` 의 `scripts` 블록, `"sprites"` 줄 바로 아래에 추가:

```json
    "sprites": "node tools/generate_sprites.mjs",
    "map:generate": "npm run sprites && node tools/generate_office.mjs",
```

(`"sprites"` 줄은 이미 있으므로 `map:generate` 줄만 새로 추가한다.)

- [ ] **Step 3: `docs/OPERATIONS.md` 의 맵 자산 안내 갱신**

`## 캐릭터와 맵 자산` 절의 "맵 단일 원본" 줄 아래에 추가:

```markdown
- 배경 이미지 생성기: `Frontend/tools/generate_office.mjs` (+ 장식 가구 데이터 `Frontend/src/data/office-props.json`)

레이아웃(방 배치·좌석·문)을 바꾸려면 `office-map.json`(부서장 좌석 포함) 과
`office-staff.ts`(팀원 좌석)를 고치고, `office-props.json` 의 `staffSeats`
사본도 같이 맞춘 뒤 아래 명령으로 배경을 다시 만든다.

```powershell
npm --workspace @ai-company/frontend run map:generate
npm --workspace @ai-company/frontend run map:validate
```
```

- [ ] **Step 4: 타입 체크 + 빌드 검증**

Run: `cd Frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add Frontend/src/components/office/sprites.ts Frontend/package.json docs/OPERATIONS.md
git commit -m "feat(office): 새 생성 배경(office-v3.png) 연결, map:generate 스크립트·문서 추가"
```

---

## Task 8: 브라우저 통합 검증

**Files:** 없음 (수동 QA — 코드 변경 없음)

**Interfaces:** 없음

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev` (루트에서, 백엔드+프런트 동시 실행) — 이미 다른 인스턴스가 3000/517x 포트를 쓰고 있다면 `npm run dev:frontend` 만 실행해도 된다(백엔드는 프록시로 기존 인스턴스를 쓴다).

- [ ] **Step 2: 브라우저로 아래 항목을 하나씩 확인**

- [ ] 오피스가 에러 없이 로드되고, 새로 넓어진 82×34 배경이 보인다
- [ ] 8개 부서(리서치·비서실·개발·재무·문서·마케팅·기획·**디자인**) 전원이 각자 방 안 자기 자리에 앉아 있다 — 디자인팀이 처음으로 전용 방을 갖는다
- [ ] 대표실이 비서실과 대회의실 사이, 중앙 라운지 바로 위에 있다
- [ ] WASD·더블클릭으로 모든 방을 오갈 수 있다 (문에서 길이 막히지 않는다)
- [ ] 회의 모드(팀 투입 후 교차검토 단계)에서 직원들이 새 회의 테이블 둘레에 모인다
- [ ] 카페·라운지 배회 시 김 파티클·아이콘이 새 좌표에서도 뜬다 (이전 서브프로젝트 기능)
- [ ] 대표님 커스텀 외형이 새 배경에서도 정상 렌더링된다
- [ ] 콘솔 에러 없음 (`read_console_messages` onlyErrors)

- [ ] **Step 3: 문제 발견 시 좌표만 조정 후 재생성**

`office-map.json`/`office-staff.ts`/`office-props.json` 좌표를 조정 → `npm run map:generate` → `map:validate` → 브라우저 재확인. (겹침·통로 폭 같은 미세 조정은 이 사이클로 잡는다 — 지금까지의 모든 서브프로젝트가 이 방식으로 다듬어졌다.)

- [ ] **Step 4: 최종 Commit** (조정이 있었던 경우)

```bash
git add Frontend/src/data Frontend/src/components/office Frontend/public/map/office-v3.png
git commit -m "fix(office): 브라우저 확인 후 좌표 미세 조정"
```
