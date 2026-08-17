/**
 * SSE 이벤트 계약 — 서버가 보내고 클라이언트가 받는 유일한 통신 규약.
 * 판별 유니온(discriminated union)이므로 프론트에서 `switch (event.type)` 시
 * 타입 좁히기가 자동으로 동작하고, 케이스 누락은 컴파일 에러가 됩니다.
 */
import type {
  AgentId,
  ArtifactSummary,
  Deliverable,
  AgentStatus,
  PhaseKey,
  RecalledNote,
  ReviewResult,
  TokenUsage,
  WorkPlan,
} from './domain';

/** 직원이 실제로 만진 도구 — 머리 위 아이콘·타임라인에 씁니다 */
export type ToolKind = 'vault' | 'file-write';

export type ToolStatus = 'started' | 'completed' | 'failed';

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

/**
 * 파일 하나가 완성됐다 — 코드형 산출물에서만 발생합니다.
 * 내용은 싣지 않습니다. 프론트는 previewUrl 로 실물을 봅니다.
 */
export interface ArtifactEvent {
  type: 'artifact';
  file: ArtifactSummary;
  /** 지금까지 만들어진 것을 브라우저로 열어볼 주소 */
  previewUrl: string;
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

/**
 * LLM 호출이 끝날 때마다 누적 사용량을 보냅니다.
 * 최종 Deliverable.usage 만으로는 진행 중 비용을 못 보여주므로 따로 흘립니다.
 */
export interface UsageEvent {
  type: 'usage';
  usage: TokenUsage;
  /** 방금 한 호출분 */
  delta: TokenUsage;
}

/**
 * 도구 사용 — Vault 조회·파일 쓰기처럼 캐릭터가 "손으로" 하는 일.
 * status 애니메이션(thinking)과 겹치지 않게 머리 위 아이콘으로 구분합니다.
 */
export interface ToolEvent {
  type: 'tool';
  agent: AgentId;
  tool: ToolKind;
  status: ToolStatus;
  /** 짧은 설명 (파일명, "과거 기록 검색" 등) */
  label?: string;
}

export type SessionEvent =
  | BootEvent
  | PhaseEvent
  | StatusEvent
  | SpeechEvent
  | RecallEvent
  | PlanEvent
  | ArtifactEvent
  | ReviewEvent
  | UsageEvent
  | ToolEvent
  | DoneEvent
  | CancelledEvent
  | ErrorEvent;

export type SessionEventType = SessionEvent['type'];
