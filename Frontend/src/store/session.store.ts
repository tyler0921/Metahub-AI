import type {
  Agent,
  AgentId,
  AgentStatus,
  ArtifactSummary,
  Deliverable,
  PhaseKey,
  SessionEvent,
  SpeechEvent,
  TokenUsage,
  ToolKind,
  WorkPlan,
} from '@shared';
import type { ReviewAttempt, TimelineEntry, UsageSlice } from '@/lib/timeline';
import { create } from 'zustand';

/**
 * 시스템 로그의 성격.
 *
 * 스토어는 **의미만** 담고, 색·아이콘 같은 표현은 `ConversationLog` 가 정합니다.
 * 예전에는 이모지가 문자열에 박혀 있어서 UI 에서 걷어낼 방법이 없었습니다.
 */
export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

/** 로그 패널에 쌓이는 항목 */
export type LogEntry =
  | { kind: 'speech'; id: number; event: SpeechEvent }
  | { kind: 'system'; id: number; text: string; level: LogLevel };

export interface AvatarState {
  status: AgentStatus;
  note: string;
  /** 이 직원이 지금 말을 거는 상대 (아바타 이동 트리거) */
  talkingTo: AgentId | null;
}

/** 직원이 지금 쓰고 있는 도구 — 머리 위 아이콘 */
export interface ActiveTool {
  tool: ToolKind;
  label: string;
}

const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

interface SessionState {
  /* 서버에서 받은 정적 데이터 */
  agents: Agent[];
  agentMap: Map<AgentId, Agent>;

  /* 진행 상태 */
  sessionId: string | null;
  /** 이번 세션의 대표 지시 원문 — 상태 알약이 제목으로 씁니다 */
  brief: string;
  /** 이번 세션에 투입된 직원 — plan 이벤트로 채워집니다 */
  team: AgentId[];
  /**
   * 비서실장이 쪼갠 업무 계획.
   *
   * 이미 `plan` 이벤트로 넘어오던 값인데 team 만 뽑아 쓰고 버리고 있었습니다.
   * 작업 보드가 이걸 그대로 씁니다 — 백엔드는 손댈 필요가 없습니다.
   */
  plan: WorkPlan | null;
  /** 캔버스에서 클릭해 들여다보는 중인 직원 */
  selectedAgentId: AgentId | null;
  /** 세션 시작 시각 (live 경과 표시용) */
  startedAt: number | null;
  /** 진행 중 LLM 호출 수 — usage 이벤트가 정확한 값으로 덮어씁니다 */
  llmCalls: number;
  /** 누적 토큰 사용량 — usage SSE 로 실시간 갱신 */
  usage: TokenUsage;
  /** 단계별 사용량 조각 — 비용 패널이 묶어서 보여줍니다 */
  usageSlices: UsageSlice[];
  /** boot 이벤트에서 받은 실행 환경 */
  provider: string;
  model: string;
  /** 직원이 지금 만지고 있는 도구 */
  activeTools: Map<AgentId, ActiveTool>;
  isRunning: boolean;
  /** 중단 요청을 보내고 서버 응답을 기다리는 중 */
  isCancelling: boolean;
  /** '이어서 지시' 로 지목된 원본 세션 (콘솔이 이 값을 보고 모드를 바꿉니다) */
  followUpFrom: string | null;
  currentPhase: PhaseKey | null;
  completedPhases: Set<PhaseKey>;
  avatars: Map<AgentId, AvatarState>;
  logs: LogEntry[];
  /**
   * 구조화된 업무 타임라인 — SSE 이벤트를 카드용으로 쌓습니다.
   * logs 와 병행합니다. logs 는 직원 상세의 발언 목록에, timeline 은 진행 탭에 씁니다.
   */
  timeline: TimelineEntry[];
  /** 검수 회차 기록 — 산출물 패널·타임라인 상세 카드가 씁니다 */
  reviews: ReviewAttempt[];
  result: Deliverable | null;
  /** 코드형 산출물에서 지금까지 만들어진 파일들 (진행 중에도 채워집니다) */
  artifacts: ArtifactSummary[];
  /** 미리보기 주소 — 파일이 하나라도 생기면 채워집니다 */
  previewUrl: string | null;
  /** 산출물 집중 모드 — 오피스를 덮고 결과물만 크게 봅니다 */
  focusMode: boolean;
  errorMessage: string | null;

  /* 액션 */
  setAgents: (agents: Agent[]) => void;
  beginSession: (sessionId: string, brief: string) => void;
  /** 새로고침 후 서버에 살아 있는 세션에 다시 붙습니다 */
  resumeSession: (sessionId: string, brief: string) => void;
  markCancelling: () => void;
  requestFollowUp: (sessionId: string) => void;
  clearFollowUp: () => void;
  setFocusMode: (on: boolean) => void;
  /** null 을 주면 선택 해제 */
  selectAgent: (agentId: AgentId | null) => void;
  applyEvent: (event: SessionEvent) => void;
  finishSession: () => void;
  failSession: (message: string) => void;
  appendSystemLog: (text: string, level?: LogLevel) => void;
}

const IDLE_AVATAR: AvatarState = { status: 'idle', note: '', talkingTo: null };

let logCounter = 0;
const nextLogId = (): number => ++logCounter;

let timelineCounter = 0;
const nextTimelineId = (): number => ++timelineCounter;
const now = (): number => Date.now();

export const useSessionStore = create<SessionState>((set, get) => ({
  agents: [],
  agentMap: new Map(),

  sessionId: null,
  brief: '',
  team: [],
  plan: null,
  selectedAgentId: null,
  startedAt: null,
  llmCalls: 0,
  usage: EMPTY_USAGE,
  usageSlices: [],
  provider: '',
  model: '',
  activeTools: new Map(),
  isRunning: false,
  isCancelling: false,
  followUpFrom: null,
  currentPhase: null,
  completedPhases: new Set(),
  avatars: new Map(),
  logs: [],
  timeline: [],
  reviews: [],
  result: null,
  artifacts: [],
  previewUrl: null,
  focusMode: false,
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
      brief,
      team: [],
      plan: null,
      selectedAgentId: null,
      startedAt: Date.now(),
      llmCalls: 0,
      usage: EMPTY_USAGE,
      usageSlices: [],
      provider: '',
      model: '',
      activeTools: new Map(),
      isRunning: true,
      isCancelling: false,
      followUpFrom: null,
      currentPhase: null,
      completedPhases: new Set(),
      result: null,
      artifacts: [],
      previewUrl: null,
      focusMode: false,
      errorMessage: null,
      avatars: new Map(state.agents.map((a) => [a.id, IDLE_AVATAR])),
      logs: [
        { kind: 'system', id: nextLogId(), level: 'info', text: `대표 지시 — "${brief}"` },
      ],
      timeline: [
        { id: nextTimelineId(), at: now(), kind: 'brief', text: brief },
      ],
      reviews: [],
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
      brief,
      team: [],
      plan: null,
      selectedAgentId: null,
      startedAt: Date.now(),
      llmCalls: 0,
      usage: EMPTY_USAGE,
      usageSlices: [],
      provider: '',
      model: '',
      activeTools: new Map(),
      isRunning: true,
      isCancelling: false,
      followUpFrom: null,
      currentPhase: null,
      completedPhases: new Set(),
      result: null,
      artifacts: [],
      previewUrl: null,
      focusMode: false,
      errorMessage: null,
      avatars: new Map(state.agents.map((a) => [a.id, IDLE_AVATAR])),
      logs: [
        {
          kind: 'system',
          id: nextLogId(),
          level: 'info',
          text: `진행 중이던 업무에 다시 연결했습니다 — "${brief}"`,
        },
      ],
      timeline: [
        { id: nextTimelineId(), at: now(), kind: 'brief', text: brief },
      ],
      reviews: [],
    })),

  markCancelling: () => set({ isCancelling: true }),

  requestFollowUp: (sessionId) => set({ followUpFrom: sessionId }),

  clearFollowUp: () => set({ followUpFrom: null }),

  setFocusMode: (on) => set({ focusMode: on }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),

  /**
   * 서버 이벤트를 상태로 환원하는 단일 지점.
   * 컴포넌트는 이벤트를 직접 보지 않고 이 스토어의 결과만 구독합니다.
   */
  applyEvent: (event) => {
    switch (event.type) {
      case 'boot':
        set({
          provider: event.provider,
          model: event.model,
        });
        if (event.provider === 'mock') {
          get().appendSystemLog(
            'mock 모드 — Backend/.env 에 API 키를 넣거나 AI_PROVIDER=ollama 로 두면 실제 AI 직원이 일합니다.',
            'warn',
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
              { kind: 'system', id: nextLogId(), level: 'info', text: event.label },
            ],
            timeline: [
              ...state.timeline,
              {
                id: nextTimelineId(),
                at: now(),
                kind: 'phase',
                key: event.key,
                label: event.label,
              },
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
            timeline: [
              ...state.timeline,
              { id: nextTimelineId(), at: event.at, kind: 'speech', event },
            ],
          };
        });
        break;

      case 'recall':
        set((state) => ({
          logs: [
            ...state.logs,
            {
              kind: 'system',
              id: nextLogId(),
              level: 'info',
              text: `볼트에서 과거 노트 ${event.notes.length}건 참조: ${event.notes.map((n) => n.title).join(' / ')}`,
            },
          ],
          timeline: [
            ...state.timeline,
            {
              id: nextTimelineId(),
              at: now(),
              kind: 'recall',
              titles: event.notes.map((n) => n.title),
            },
          ],
        }));
        break;

      case 'plan': {
        set((state) => ({
          team: event.team,
          plan: event.plan,
          logs: [
            ...state.logs,
            {
              kind: 'system',
              id: nextLogId(),
              level: 'info',
              text: `투입 부서: ${event.team
                .map((id) => get().agentMap.get(id)?.dept ?? id)
                .join(' · ')}`,
            },
          ],
          timeline: [
            ...state.timeline,
            {
              id: nextTimelineId(),
              at: now(),
              kind: 'plan',
              goal: event.plan.goal,
              deliverable: event.plan.deliverable,
              team: event.team,
            },
          ],
        }));
        break;
      }

      /**
       * 파일 하나가 완성됐다.
       *
       * 같은 경로가 다시 오면(재작업) 덮어씁니다. 목록이 중복으로
       * 불어나면 대표가 몇 개가 진짜인지 알 수 없게 됩니다.
       */
      case 'artifact':
        set((state) => {
          const artifacts = state.artifacts.filter(
            (a) => a.path !== event.file.path,
          );
          artifacts.push(event.file);
          return {
            artifacts,
            previewUrl: event.previewUrl,
            logs: [
              ...state.logs,
              {
                kind: 'system',
                id: nextLogId(),
                level: 'info',
                text: `${event.file.path} (${event.file.bytes.toLocaleString()} B)`,
              },
            ],
            timeline: [
              ...state.timeline,
              {
                id: nextTimelineId(),
                at: now(),
                kind: 'artifact',
                path: event.file.path,
                bytes: event.file.bytes,
              },
            ],
          };
        });
        break;

      case 'review':
        set((state) => ({
          reviews: [
            ...state.reviews,
            { review: event.review, attempt: event.attempt, at: now() },
          ],
          logs: [
            ...state.logs,
            {
              kind: 'system',
              id: nextLogId(),
              level: event.review.verdict === 'approve' ? 'ok' : 'warn',
              text: `검수 ${event.review.score}점 — ${
                event.review.verdict === 'approve'
                  ? '승인'
                  : '반려, 재작업으로 넘어갑니다'
              }`,
            },
          ],
          timeline: [
            ...state.timeline,
            {
              id: nextTimelineId(),
              at: now(),
              kind: 'review',
              review: event.review,
              attempt: event.attempt,
            },
          ],
        }));
        break;

      case 'usage':
        set((state) => ({
          usage: event.usage,
          llmCalls: event.usage.calls,
          usageSlices: [
            ...state.usageSlices,
            {
              at: now(),
              phase: state.currentPhase,
              inputTokens: event.delta.inputTokens,
              outputTokens: event.delta.outputTokens,
              calls: event.delta.calls,
            },
          ],
        }));
        break;

      case 'tool':
        set((state) => {
          const activeTools = new Map(state.activeTools);
          if (event.status === 'started') {
            activeTools.set(event.agent, {
              tool: event.tool,
              label: event.label ?? event.tool,
            });
          } else {
            activeTools.delete(event.agent);
          }

          const toolLabel =
            event.tool === 'vault' ? 'Vault' : '파일 작성';
          const statusLabel =
            event.status === 'started'
              ? '시작'
              : event.status === 'failed'
                ? '실패'
                : '완료';

          return {
            activeTools,
            logs: [
              ...state.logs,
              {
                kind: 'system' as const,
                id: nextLogId(),
                level: event.status === 'failed' ? ('error' as const) : ('info' as const),
                text: `${toolLabel} ${statusLabel}${event.label ? ` — ${event.label}` : ''}`,
              },
            ],
            // started 는 머리 위 아이콘만, 타임라인에는 완료·실패만 남깁니다
            timeline:
              event.status === 'started'
                ? state.timeline
                : [
                    ...state.timeline,
                    {
                      id: nextTimelineId(),
                      at: now(),
                      kind: 'tool' as const,
                      agent: event.agent,
                      tool: event.tool,
                      status: event.status,
                      label: event.label,
                    },
                  ],
          };
        });
        break;

      case 'done':
        set((state) => {
          const summary =
            event.result.kind === 'website'
              ? `완료 (${event.result.elapsedSeconds}초 · LLM 호출 ${event.result.usage.calls}회) — 파일 ${event.result.artifacts.length}개를 만들었습니다.`
              : `완료 (${event.result.elapsedSeconds}초 · LLM 호출 ${event.result.usage.calls}회) — 볼트에 저장했습니다.`;
          return {
            result: event.result,
            previewUrl: event.result.previewUrl ?? state.previewUrl,
            usage: event.result.usage,
            llmCalls: event.result.usage.calls,
            activeTools: new Map(),
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
              { kind: 'system', id: nextLogId(), level: 'ok', text: summary },
            ],
            timeline: [
              ...state.timeline,
              {
                id: nextTimelineId(),
                at: now(),
                kind: 'done',
                summary,
                deliverableKind: event.result.kind,
              },
            ],
          };
        });
        break;

      case 'cancelled':
        set((state) => ({
          isRunning: false,
          isCancelling: false,
          currentPhase: null,
          activeTools: new Map(),
          logs: [
            ...state.logs,
            { kind: 'system', id: nextLogId(), level: 'warn', text: event.reason },
          ],
          timeline: [
            ...state.timeline,
            {
              id: nextTimelineId(),
              at: now(),
              kind: 'cancelled',
              reason: event.reason,
            },
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
      activeTools: new Map(),
      logs: [
        ...state.logs,
        { kind: 'system', id: nextLogId(), level: 'error', text: message },
      ],
      timeline: [
        ...state.timeline,
        { id: nextTimelineId(), at: now(), kind: 'error', message },
      ],
    })),

  appendSystemLog: (text, level = 'info') =>
    set((state) => ({
      logs: [...state.logs, { kind: 'system', id: nextLogId(), level, text }],
    })),
}));
