import type {
  AgentsResponse,
  AppConfigResponse,
  AutonomousWorkStatusResponse,
  CreateSessionResponse,
  HealthResponse,
  SessionDetailResponse,
  SessionSummary,
} from '@shared';
import { http } from './http.client';

/** 회사(백엔드) 조회 API */
export const companyService = {
  health: (): Promise<HealthResponse> => http.get('/health'),

  getAgents: (): Promise<AgentsResponse> => http.get('/agents'),

  getConfig: (): Promise<AppConfigResponse> => http.get('/config'),

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

  /** 진행 중인 세션 중단 — 돌고 있는 LLM 호출까지 끊습니다 */
  cancelSession: (id: string): Promise<SessionDetailResponse> =>
    http.post(`/sessions/${id}/cancel`, {}),
};
