/**
 * SSE 이벤트 계약 — 서버가 보내고 클라이언트가 받는 유일한 통신 규약.
 * 판별 유니온(discriminated union)이므로 프론트에서 `switch (event.type)` 시
 * 타입 좁히기가 자동으로 동작하고, 케이스 누락은 컴파일 에러가 됩니다.
 */
import type {
  AgentId,
  AgentStatus,
  Deliverable,
  PhaseKey,
  RecalledNote,
  ReviewResult,
  WorkPlan,
} from './domain';

/** 세션 시작 — 실행 환경 정보 */
export interface BootEvent {
  type: 'boot';
  sessionId: string;
  provider: string;
  model: string;
  vaultPath: string;
}

/** 파이프라인 단계 전환 */
export interface PhaseEvent {
  type: 'phase';
  key: PhaseKey;
  label: string;
}

/** 직원 상태 변경 (아바타 애니메이션용) */
export interface StatusEvent {
  type: 'status';
  agent: AgentId;
  status: AgentStatus;
  note: string;
}

/** 직원의 발언 — `to` 가 있으면 특정 부서를 지목한 것 */
export interface SpeechEvent {
  type: 'speech';
  agent: AgentId;
  to: AgentId | null;
  phase: string;
  text: string;
  at: number;
}

/** 볼트에서 회상한 과거 기록 */
export interface RecallEvent {
  type: 'recall';
  notes: RecalledNote[];
}

/** 업무 분해 결과 */
export interface PlanEvent {
  type: 'plan';
  plan: WorkPlan;
  team: AgentId[];
}

/** 검수 결과 */
export interface ReviewEvent {
  type: 'review';
  review: ReviewResult;
  attempt: number;
}

/** 완료 — 최종 산출물 */
export interface DoneEvent {
  type: 'done';
  result: Deliverable;
}

/** 대표가 중단 */
export interface CancelledEvent {
  type: 'cancelled';
  reason: string;
}

/** 실패 */
export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type SessionEvent =
  | BootEvent
  | PhaseEvent
  | StatusEvent
  | SpeechEvent
  | RecallEvent
  | PlanEvent
  | ReviewEvent
  | DoneEvent
  | CancelledEvent
  | ErrorEvent;

export type SessionEventType = SessionEvent['type'];
