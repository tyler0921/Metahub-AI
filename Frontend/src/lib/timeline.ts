import type {
  AgentId,
  DeliverableKind,
  PhaseKey,
  ReviewResult,
  SpeechEvent,
} from '@shared';

/**
 * 업무 타임라인 한 칸.
 *
 * SSE 이벤트를 그대로 쌓되, UI 가 카드로 읽기 쉽게 좁힌 형태입니다.
 * ConversationLog 의 평문 시스템 로그와 달리 kind 로 레이아웃이 갈립니다.
 */
export type TimelineEntry =
  | { id: number; at: number; kind: 'brief'; text: string }
  | { id: number; at: number; kind: 'recall'; titles: string[] }
  | {
      id: number;
      at: number;
      kind: 'plan';
      goal: string;
      deliverable: string;
      team: AgentId[];
    }
  | { id: number; at: number; kind: 'phase'; key: PhaseKey; label: string }
  | { id: number; at: number; kind: 'speech'; event: SpeechEvent }
  | { id: number; at: number; kind: 'artifact'; path: string; bytes: number }
  | {
      id: number;
      at: number;
      kind: 'review';
      review: ReviewResult;
      attempt: number;
    }
  | {
      id: number;
      at: number;
      kind: 'tool';
      agent: AgentId;
      tool: 'vault' | 'file-write';
      status: 'started' | 'completed' | 'failed';
      label?: string;
    }
  | {
      id: number;
      at: number;
      kind: 'done';
      summary: string;
      deliverableKind: DeliverableKind;
    }
  | { id: number; at: number; kind: 'cancelled'; reason: string }
  | { id: number; at: number; kind: 'error'; message: string };

/** 단계별 사용량 한 줄 — usage 이벤트를 받을 때 currentPhase 로 묶습니다 */
export type UsageSlice = {
  at: number;
  phase: PhaseKey | null;
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type ReviewAttempt = {
  review: ReviewResult;
  attempt: number;
  at: number;
};
