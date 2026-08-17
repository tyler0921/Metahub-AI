/**
 * 도메인 모델 계약 — Backend 와 Frontend 가 공유하는 타입 정의.
 *
 * ⚠️ 이 패키지에는 **타입만** 둡니다. 런타임 값(클래스·상수·enum)을 넣지 마세요.
 *    타입 전용이어야 `import type` 으로 완전히 소거되어 양쪽 빌드가 서로를 침범하지 않습니다.
 */

/** AI 직원 식별자 */
export type AgentId =
  // 팀장 (부서를 대표해 교차검토에 참여)
  | 'chief'
  | 'planner'
  | 'researcher'
  | 'marketer'
  | 'dev'
  | 'finance'
  | 'writer'
  // 팀원 (소속 부서의 초안 작성에 참여)
  | 'chief-senior' | 'chief-junior'
  | 'planner-senior' | 'planner-junior'
  | 'researcher-senior' | 'researcher-junior'
  | 'marketer-senior' | 'marketer-junior'
  | 'dev-senior' | 'dev-junior'
  | 'finance-senior' | 'finance-junior'
  | 'writer-senior' | 'writer-junior';

/** 부서를 대표하는 팀장 id */
export type TeamId =
  | 'chief' | 'planner' | 'researcher' | 'marketer' | 'dev' | 'finance' | 'writer';

/** 직급 — 부서 안에서 무슨 역할을 맡는지 결정합니다 */
export type AgentRank = 'lead' | 'senior' | 'junior';

/** 직원의 조직 내 역할 구분 */
export type AgentKind = 'chief' | 'staff' | 'editor';

/** 메타버스 오피스 상의 좌석 좌표 (타일 단위) */
export interface DeskPosition {
  x: number;
  y: number;
}

/** AI 직원 (system 프롬프트는 서버 밖으로 내보내지 않습니다) */
export interface Agent {
  id: AgentId;
  name: string;
  title: string;
  dept: string;
  kind: AgentKind;
  emoji: string;
  color: string;
  desk: DeskPosition;
  specialty: string;
  /** 소속 부서 (팀장의 id 와 같습니다) */
  team: TeamId;
  rank: AgentRank;
}

/** 2D 오피스 맵 */
export interface OfficeMap {
  cols: number;
  rows: number;
  tile: number;
  ceoDesk: DeskPosition;
}

/** 파이프라인 단계 키 */
export type PhaseKey =
  | 'recall'
  | 'kickoff'
  | 'draft'
  | 'feedback'
  | 'revise'
  /** 문서형 — 문서팀이 원고를 하나로 합칩니다 */
  | 'integrate'
  /** 코드형 — 개발팀이 실행 가능한 파일을 만듭니다 */
  | 'build'
  | 'review'
  | 'save';

/**
 * 산출물의 종류.
 *
 * `document` 는 읽는 것이 목적인 보고서·기획안이고,
 * `website` 는 **브라우저에서 바로 열리는 파일 묶음**입니다.
 * 이 값에 따라 파이프라인의 5단계가 통합(integrate)이 될지
 * 빌드(build)가 될지 갈립니다.
 */
export type DeliverableKind = 'document' | 'website';

/** 코드형 산출물이 만들어낸 파일 하나 */
export interface ArtifactFile {
  /** 프로젝트 폴더 기준 상대경로 (예: `index.html`, `assets/style.css`) */
  path: string;
  language: string;
  content: string;
  bytes: number;
}

/**
 * 파일 메타데이터만 담은 형태.
 * 내용까지 SSE 로 흘리면 스트림이 무거워지므로 진행 중에는 이것만 보냅니다.
 */
export interface ArtifactSummary {
  path: string;
  language: string;
  bytes: number;
}

/** 아바타 상태 */
export type AgentStatus = 'idle' | 'thinking' | 'talking' | 'done';

/** 세션 진행 상태 */
export type SessionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  /** 대표가 중간에 멈춘 경우 */
  | 'cancelled';

/** 비서실장이 특정 부서에 내린 업무 지시 */
export interface Assignment {
  agent: AgentId;
  task: string;
}

/** 비서실장의 업무 분해 결과 */
export interface WorkPlan {
  goal: string;
  successCriteria: string[];
  deliverable: string;
  /** 보고서를 쓸 일인지, 실제로 만들 일인지 */
  kind: DeliverableKind;
  assignments: Assignment[];
}

/** 검수 판정 */
export interface ReviewResult {
  verdict: 'approve' | 'rework';
  score: number;
  strengths: string[];
  issues: string[];
  note: string;
}

/** 볼트에서 회상한 과거 노트 */
export interface RecalledNote {
  title: string;
  path: string;
}

/** LLM 토큰 사용량 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/** 최종 산출물 */
export interface Deliverable {
  sessionId: string;
  /** 이 산출물을 고쳐 만든 원본 세션 (후속 지시인 경우) */
  parentSessionId?: string;
  brief: string;
  kind: DeliverableKind;
  /**
   * 문서형이면 산출물 본문 그 자체이고,
   * 코드형이면 무엇을 만들었는지 설명하는 요약문입니다.
   */
  body: string;
  /** 코드형에서 실제로 만들어진 파일들 (문서형은 빈 배열) */
  artifacts: ArtifactFile[];
  /** 브라우저로 열어볼 수 있는 주소 — 코드형에서만 채워집니다 */
  previewUrl: string | null;
  /** workspace/ 아래 프로젝트 폴더명 — 코드형에서만 채워집니다 */
  workspaceFolder: string | null;
  review: ReviewResult | null;
  plan: WorkPlan;
  team: AgentId[];
  vaultFolder: string;
  elapsedSeconds: number;
  usage: TokenUsage;
}
