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
 * 직원은 데스크(북쪽 한 칸) 앞에서 화면 쪽을 보고 서 있으므로 `facing: 'down'` 입니다 —
 * `office-renderer.ts` 가 업무 중엔 항상 'down' 으로 덮어쓰기 때문에 실제로는
 * 유휴 상태일 때만 쓰이는 값입니다.
 */
export const STAFF_SEATS: readonly OfficeStaffSeat[] = [
  // ── 비서실
  { id: 'chief-senior', sprite: 'chief', seat: { x: 26, y: 4 }, facing: 'down' },
  { id: 'chief-junior', sprite: 'chief', seat: { x: 33, y: 4 }, facing: 'down' },

  // ── 리서치팀
  { id: 'researcher-senior', sprite: 'researcher', seat: { x: 6, y: 4 }, facing: 'down' },
  { id: 'researcher-junior', sprite: 'researcher', seat: { x: 16, y: 4 }, facing: 'down' },

  // ── 개발팀
  { id: 'dev-senior', sprite: 'dev', seat: { x: 5, y: 15 }, facing: 'down' },
  { id: 'dev-junior', sprite: 'dev', seat: { x: 13, y: 15 }, facing: 'down' },

  // ── 기획팀
  { id: 'planner-senior', sprite: 'planner', seat: { x: 5, y: 31 }, facing: 'down' },
  { id: 'planner-junior', sprite: 'planner', seat: { x: 13, y: 31 }, facing: 'down' },

  // ── 문서팀
  { id: 'writer-senior', sprite: 'writer', seat: { x: 54, y: 15 }, facing: 'down' },
  { id: 'writer-junior', sprite: 'writer', seat: { x: 61, y: 15 }, facing: 'down' },

  // ── 마케팅팀
  { id: 'marketer-senior', sprite: 'marketer', seat: { x: 69, y: 15 }, facing: 'down' },
  { id: 'marketer-junior', sprite: 'marketer', seat: { x: 77, y: 15 }, facing: 'down' },

  // ── 재무팀
  { id: 'finance-senior', sprite: 'finance', seat: { x: 21, y: 15 }, facing: 'down' },
  { id: 'finance-junior', sprite: 'finance', seat: { x: 28, y: 15 }, facing: 'down' },

  // ── 디자인팀 (이제 전용 방이 있습니다 — 팀장 좌석은 zones[].seat)
  { id: 'designer-senior', sprite: 'designer', seat: { x: 22, y: 31 }, facing: 'down' },
  { id: 'designer-junior', sprite: 'designer', seat: { x: 30, y: 31 }, facing: 'down' },
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
