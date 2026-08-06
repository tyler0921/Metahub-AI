import type {
  Agent,
  AgentId,
  AgentStatus,
  Deliverable,
  PhaseKey,
  SessionEvent,
  SpeechEvent,
} from '@shared';
import { create } from 'zustand';

/** 로그 패널에 쌓이는 항목 */
export type LogEntry =
  | { kind: 'speech'; id: number; event: SpeechEvent }
  | { kind: 'system'; id: number; text: string };

export interface AvatarState {
  status: AgentStatus;
  note: string;
  /** 이 직원이 지금 말을 거는 상대 (아바타 이동 트리거) */
  talkingTo: AgentId | null;
}

interface SessionState {
  /* 서버에서 받은 정적 데이터 */
  agents: Agent[];
  agentMap: Map<AgentId, Agent>;

  /* 진행 상태 */
  sessionId: string | null;
  isRunning: boolean;
  /** 중단 요청을 보내고 서버 응답을 기다리는 중 */
  isCancelling: boolean;
  /** '이어서 지시' 로 지목된 원본 세션 (콘솔이 이 값을 보고 모드를 바꿉니다) */
  followUpFrom: string | null;
  currentPhase: PhaseKey | null;
  completedPhases: Set<PhaseKey>;
  avatars: Map<AgentId, AvatarState>;
  logs: LogEntry[];
  result: Deliverable | null;
  errorMessage: string | null;

  /* 액션 */
  setAgents: (agents: Agent[]) => void;
  beginSession: (sessionId: string, brief: string) => void;
  /** 새로고침 후 서버에 살아 있는 세션에 다시 붙습니다 */
  resumeSession: (sessionId: string, brief: string) => void;
  markCancelling: () => void;
  requestFollowUp: (sessionId: string) => void;
  clearFollowUp: () => void;
  applyEvent: (event: SessionEvent) => void;
  finishSession: () => void;
  failSession: (message: string) => void;
  appendSystemLog: (text: string) => void;
}

const IDLE_AVATAR: AvatarState = { status: 'idle', note: '', talkingTo: null };

let logCounter = 0;
const nextLogId = (): number => ++logCounter;

export const useSessionStore = create<SessionState>((set, get) => ({
  agents: [],
  agentMap: new Map(),

  sessionId: null,
  isRunning: false,
  isCancelling: false,
  followUpFrom: null,
  currentPhase: null,
  completedPhases: new Set(),
  avatars: new Map(),
  logs: [],
  result: null,
  errorMessage: null,

  setAgents: (agents) =>
    set({
      agents,
      agentMap: new Map(agents.map((a) => [a.id, a])),
      avatars: new Map(agents.map((a) => [a.id, IDLE_AVATAR])),
    }),

  beginSession: (sessionId, brief) =>
    set((state) => ({
      sessionId,
      isRunning: true,
      isCancelling: false,
      followUpFrom: null,
      currentPhase: null,
      completedPhases: new Set(),
      result: null,
      errorMessage: null,
      avatars: new Map(state.agents.map((a) => [a.id, IDLE_AVATAR])),
      logs: [{ kind: 'system', id: nextLogId(), text: `🎤 대표 지시 — "${brief}"` }],
    })),

  /**
   * 새로고침 복귀.
   *
   * 서버의 이벤트 스트림이 ReplaySubject 라서 재구독만 하면 그동안의
   * 진행 상황이 그대로 다시 흘러옵니다. 여기서는 자리만 비워 두면 됩니다.
   */
  resumeSession: (sessionId, brief) =>
    set((state) => ({
      sessionId,
      isRunning: true,
      isCancelling: false,
      followUpFrom: null,
      currentPhase: null,
      completedPhases: new Set(),
      result: null,
      errorMessage: null,
      avatars: new Map(state.agents.map((a) => [a.id, IDLE_AVATAR])),
      logs: [
        {
          kind: 'system',
          id: nextLogId(),
          text: `↩️ 진행 중이던 업무에 다시 연결했습니다 — "${brief}"`,
        },
      ],
    })),

  markCancelling: () => set({ isCancelling: true }),

  requestFollowUp: (sessionId) => set({ followUpFrom: sessionId }),

  clearFollowUp: () => set({ followUpFrom: null }),

  /**
   * 서버 이벤트를 상태로 환원하는 단일 지점.
   * 컴포넌트는 이벤트를 직접 보지 않고 이 스토어의 결과만 구독합니다.
   */
  applyEvent: (event) => {
    switch (event.type) {
      case 'boot':
        if (event.provider === 'mock') {
          get().appendSystemLog(
            '⚠️ mock 모드 — Backend/.env 에 ANTHROPIC_API_KEY 를 넣으면 실제 AI 직원이 일합니다.',
          );
        }
        break;

      case 'phase':
        set((state) => {
          const completed = new Set(state.completedPhases);
          if (state.currentPhase) completed.add(state.currentPhase);
          return {
            currentPhase: event.key,
            completedPhases: completed,
            logs: [
              ...state.logs,
              { kind: 'system', id: nextLogId(), text: `── ${event.label} ──` },
            ],
          };
        });
        break;

      case 'status':
        set((state) => {
          const avatars = new Map(state.avatars);
          const previous = avatars.get(event.agent) ?? IDLE_AVATAR;
          avatars.set(event.agent, {
            status: event.status,
            note: event.note,
            // 자리로 돌아가는 상태들은 대화 상대를 비운다
            talkingTo: event.status === 'talking' ? previous.talkingTo : null,
          });
          return { avatars };
        });
        break;

      case 'speech':
        set((state) => {
          const avatars = new Map(state.avatars);
          if (event.to) {
            const previous = avatars.get(event.agent) ?? IDLE_AVATAR;
            avatars.set(event.agent, { ...previous, talkingTo: event.to });
          }
          return {
            avatars,
            logs: [...state.logs, { kind: 'speech', id: nextLogId(), event }],
          };
        });
        break;

      case 'recall':
        get().appendSystemLog(
          `📚 볼트에서 과거 노트 ${event.notes.length}건 참조: ${event.notes.map((n) => n.title).join(' / ')}`,
        );
        break;

      case 'plan': {
        const names = event.team
          .map((id) => get().agentMap.get(id)?.dept ?? id)
          .join(' · ');
        get().appendSystemLog(`👥 투입 부서: ${names}`);
        break;
      }

      case 'review':
        get().appendSystemLog(
          `🧐 검수 ${event.review.score}점 — ${
            event.review.verdict === 'approve' ? '승인 ✅' : '반려 → 재작업 ♻️'
          }`,
        );
        break;

      case 'done':
        set((state) => ({
          result: event.result,
          isRunning: false,
          isCancelling: false,
          currentPhase: null,
          completedPhases: new Set([
            ...state.completedPhases,
            ...(state.currentPhase ? [state.currentPhase] : []),
            'save' as PhaseKey,
          ]),
          logs: [
            ...state.logs,
            {
              kind: 'system',
              id: nextLogId(),
              text: `✅ 완료 (${event.result.elapsedSeconds}초 · LLM 호출 ${event.result.usage.calls}회) — 볼트에 저장했습니다.`,
            },
          ],
        }));
        break;

      case 'cancelled':
        set((state) => ({
          isRunning: false,
          isCancelling: false,
          currentPhase: null,
          logs: [
            ...state.logs,
            { kind: 'system', id: nextLogId(), text: `⏹️ ${event.reason}` },
          ],
        }));
        break;

      case 'error':
        get().failSession(event.message);
        break;
    }
  },

  finishSession: () => set({ isRunning: false, isCancelling: false }),

  failSession: (message) =>
    set((state) => ({
      isRunning: false,
      isCancelling: false,
      errorMessage: message,
      logs: [...state.logs, { kind: 'system', id: nextLogId(), text: `❌ ${message}` }],
    })),

  appendSystemLog: (text) =>
    set((state) => ({
      logs: [...state.logs, { kind: 'system', id: nextLogId(), text }],
    })),
}));
