import type { AgentId, AgentStatus, PhaseKey, ToolKind, ToolStatus } from '@shared';
import type { AgentsService } from '../../agents/agents.service';
import type { WorkSessionEntity } from '../entities/work-session.entity';

/**
 * 한 단계가 실행되는 동안 공유되는 컨텍스트.
 * 각 Phase 는 이 객체만 받아서 동작하므로 서로를 직접 호출하지 않습니다.
 */
export interface PhaseContext {
  session: WorkSessionEntity;
  agents: AgentsService;
  /** 볼트에서 회상한 과거 기록 (프롬프트에 그대로 붙는 텍스트) */
  recallContext: string;
}

/** 파이프라인 단계 계약 */
export interface WorkflowPhase {
  readonly key: PhaseKey;
  readonly label: string;
  execute(context: PhaseContext): Promise<void>;
}

/**
 * Phase 들이 공통으로 쓰는 발화·상태 이벤트 헬퍼.
 * 이벤트 발행 규칙을 한 곳에 모아 각 Phase 코드를 업무 로직에 집중시킵니다.
 */
export class PhaseNarrator {
  constructor(
    private readonly session: WorkSessionEntity,
    private readonly defaultPhaseLabel: string,
  ) {}

  status(agent: AgentId, status: AgentStatus, note = ''): void {
    this.session.emit({ type: 'status', agent, status, note });
  }

  say(
    agent: AgentId,
    text: string,
    to: AgentId | null = null,
    phaseLabel: string = this.defaultPhaseLabel,
  ): void {
    this.session.emit({
      type: 'speech',
      agent,
      to,
      phase: phaseLabel,
      text,
      at: Date.now(),
    });
  }

  /** Vault·파일 쓰기 같은 도구 사용 — 머리 위 아이콘용 */
  tool(
    agent: AgentId,
    tool: ToolKind,
    status: ToolStatus,
    label?: string,
  ): void {
    this.session.emit({ type: 'tool', agent, tool, status, label });
  }
}
