/** HTTP 응답 계약 (REST) */
import type {
  Agent,
  Deliverable,
  OfficeMap,
  SessionStatus,
} from './domain';

/** GET /api/agents */
export interface AgentsResponse {
  agents: Agent[];
  office: OfficeMap;
}

/** GET /api/config */
export interface AppConfigResponse {
  provider: string;
  model: string;
  vaultPath: string;
  vaultRoot: string;
  feedbackRounds: number;
  maxRework: number;
  adminAuthRequired: boolean;
  llmBudget: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    dailyCallLimit: number;
    dailyTokenLimit: number;
  };
  autonomousWork: {
    enabled: boolean;
    intervalMinutes: number;
    dailyLimit: number;
  };
}

export interface AutonomousWorkStatusResponse {
  configured: boolean;
  enabled: boolean;
  paused: boolean;
  runsToday: number;
  dailyLimit: number;
  consecutiveFailures: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastSessionId: string | null;
  activeSession: SessionSummary | null;
  queuedCount: number;
  pendingApprovalCount: number;
}

export type AutonomousBacklogStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AutonomousBacklogItem {
  id: string;
  brief: string;
  priority: number;
  status: AutonomousBacklogStatus;
  createdAt: string;
  sessionId: string | null;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AutonomousApprovalItem {
  id: string;
  sessionId: string;
  brief: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
}

export interface AutonomousInboxResponse {
  backlog: AutonomousBacklogItem[];
  approvals: AutonomousApprovalItem[];
}

/** POST /api/sessions 요청 본문 */
export interface CreateSessionRequest {
  brief: string;
  /**
   * 이전 세션을 이어서 고칠 때 그 세션 id.
   * 주면 이전 산출물과 검수 의견을 그대로 물려받아, 처음부터 다시 하지 않습니다.
   */
  parentSessionId?: string;
}

/** 세션 요약 */
export interface SessionSummary {
  id: string;
  brief: string;
  status: SessionStatus;
  createdAt: string;
  score: number | null;
  parentSessionId: string | null;
}

/** POST /api/sessions 응답 */
export interface CreateSessionResponse {
  session: SessionSummary;
  /** 이 주소를 EventSource 로 구독하면 진행 상황이 흘러옵니다 */
  streamUrl: string;
}

/** GET /api/sessions/:id */
export interface SessionDetailResponse {
  session: SessionSummary;
  result: Deliverable | null;
}

/** GET /api/vault/projects */
export interface VaultProjectsResponse {
  basePath: string;
  projects: VaultProjectSummary[];
}

export interface VaultProjectSummary {
  folder: string;
  title: string;
  date: string;
}

/** GET /api/vault/notes?path= */
export interface VaultNoteResponse {
  path: string;
  content: string;
}

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
  uptime: number;
  version: string;
}
