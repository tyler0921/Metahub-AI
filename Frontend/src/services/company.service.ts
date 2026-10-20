import type {
  AgentId,
  AgentsResponse,
  AmbientChatResponse,
  AppConfigResponse,
  AutonomousWorkStatusResponse,
  AutonomousInboxResponse,
  AutonomousBacklogItem,
  AutonomousApprovalItem,
  CreateSessionResponse,
  HealthResponse,
  LlmModelOption,
  LlmModelsResponse,
  SessionDetailResponse,
  SessionSummary,
} from '@shared';
import { http } from './http.client';

/** 회사(백엔드) 조회 API */
export const companyService = {
  health: (): Promise<HealthResponse> => http.get('/health'),

  getAgents: (): Promise<AgentsResponse> => http.get('/agents'),

  /** 오피스 휴게 중 두 직원의 AI 스몰토크 */
  requestAmbientChat: (agentA: AgentId, agentB: AgentId): Promise<AmbientChatResponse> =>
    http.post('/agents/ambient-chat', { agentA, agentB }),

  getConfig: (): Promise<AppConfigResponse> => http.get('/config'),

  getLlmModels: (): Promise<LlmModelsResponse> => http.get('/llm/models'),

  /** 다음 업무부터 쓸 모델을 바꿉니다 — 업무가 진행 중이면 서버가 거절합니다 */
  selectLlmModel: (option: LlmModelOption): Promise<LlmModelsResponse> =>
    http.post('/llm/model', option),

  /**
   * 대표 지시 접수 — 실제 작업은 서버에서 백그라운드로 진행됩니다.
   * `parentSessionId` 를 주면 그 산출물을 물려받아 이어서 작업합니다.
   */
  createSession: (
    brief: string,
    parentSessionId?: string,
  ): Promise<CreateSessionResponse> =>
    http.post('/sessions', parentSessionId ? { brief, parentSessionId } : { brief }),

  getSession: (id: string): Promise<SessionDetailResponse> =>
    http.get(`/sessions/${id}`),

  getActiveSession: (): Promise<SessionSummary | null> => http.get('/sessions/active'),

  getAutonomousWorkStatus: (): Promise<AutonomousWorkStatusResponse> =>
    http.get('/autonomous-work/status'),

  pauseAutonomousWork: (): Promise<AutonomousWorkStatusResponse> =>
    http.post('/autonomous-work/pause', {}),

  resumeAutonomousWork: (): Promise<AutonomousWorkStatusResponse> =>
    http.post('/autonomous-work/resume', {}),

  runAutonomousWorkNow: (): Promise<AutonomousWorkStatusResponse> =>
    http.post('/autonomous-work/run-now', {}),

  getAutonomousInbox: (): Promise<AutonomousInboxResponse> =>
    http.get('/autonomous-work/inbox'),

  addAutonomousBacklog: (brief: string, priority: number): Promise<AutonomousBacklogItem> =>
    http.post('/autonomous-work/backlog', { brief, priority }),

  cancelAutonomousBacklog: (id: string): Promise<AutonomousBacklogItem> =>
    http.post(`/autonomous-work/backlog/${id}/cancel`, {}),

  decideAutonomousApproval: (
    id: string,
    approved: boolean,
    note?: string,
  ): Promise<AutonomousApprovalItem> =>
    http.post(
      `/autonomous-work/approvals/${id}/${approved ? 'approve' : 'reject'}`,
      note ? { note } : {},
    ),

  /** 진행 중인 세션 중단 — 돌고 있는 LLM 호출까지 끊습니다 */
  cancelSession: (id: string): Promise<SessionDetailResponse> =>
    http.post(`/sessions/${id}/cancel`, {}),
};
