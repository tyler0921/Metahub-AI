import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AutonomousWorkStatusResponse, SessionEvent } from '@shared';
import type { Subscription } from 'rxjs';
import type { AutonomousWorkConfig } from '../config/configuration';
import { AutonomousBriefPlannerService } from './autonomous-brief-planner.service';
import { AutonomousStateStore } from './autonomous-state.store';
import { AutonomousInboxStore } from './autonomous-inbox.store';
import { SessionRepository } from './repositories/session.repository';
import { WorkflowService } from './workflow.service';

export const AUTONOMOUS_BRIEFS = [
  '[자율 업무] 최근 업무 기록과 산출물을 검토하고, 회사 운영 품질을 가장 크게 높일 수 있는 개선 과제 하나를 스스로 선정해 실행한 뒤 결과와 다음 행동을 보고해줘.',
  '[자율 업무] 현재 서비스와 사용자 경험을 점검하고, 사용자가 바로 체감할 수 있는 개선 기회 하나를 찾아 구체적인 실행안과 산출물로 완성해줘.',
  '[자율 업무] 사내 지식과 최근 프로젝트를 검토해 누락된 위험, 반복되는 비효율 또는 새 기회를 하나 발굴하고 관련 부서가 협업해 해결 결과를 보고해줘.',
] as const;

export function chooseAutonomousBrief(recentBriefs: readonly string[]): string {
  return AUTONOMOUS_BRIEFS.find((brief) => !recentBriefs.includes(brief)) ?? AUTONOMOUS_BRIEFS[0];
}

@Injectable()
export class AutonomousWorkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutonomousWorkService.name);
  private readonly config: AutonomousWorkConfig;
  private timer: NodeJS.Timeout | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private sessionSubscription: Subscription | null = null;
  /**
   * 다음 과제를 고르는 중(LLM 호출)엔 세션이 아직 등록되지 않아 findActive() 가
   * 비어 있는 창이 생깁니다. 그 틈에 tick 이나 run-now 가 겹쳐 들어오지 않도록 막습니다.
   */
  private starting = false;

  constructor(
    config: ConfigService,
    private readonly stateStore: AutonomousStateStore,
    private readonly inbox: AutonomousInboxStore,
    private readonly sessions: SessionRepository,
    private readonly workflow: WorkflowService,
    private readonly briefPlanner: AutonomousBriefPlannerService,
  ) {
    this.config = config.getOrThrow<AutonomousWorkConfig>('autonomousWork');
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('자율 업무 모드가 꺼져 있습니다.');
      return;
    }
    const state = this.stateStore.reload();
    this.logger.log(
      `자율 업무 모드 시작 (하루 최대 ${this.config.dailyLimit}회, ` +
      `${Math.round(this.config.intervalMs / 60_000)}분 간격)`,
    );
    if (state.paused) return;
    const savedDelay = state.nextRunAt
      ? Math.max(1_000, new Date(state.nextRunAt).getTime() - Date.now())
      : this.config.startupDelayMs;
    this.schedule(savedDelay);
  }

  onModuleDestroy(): void {
    this.clearTimer();
    this.clearSessionWatch();
  }

  getStatus(): AutonomousWorkStatusResponse {
    this.stateStore.syncDay();
    const state = this.stateStore.snapshot();
    const inbox = this.inbox.snapshot();
    return {
      configured: this.config.enabled,
      enabled: this.config.enabled && !state.paused,
      paused: state.paused,
      runsToday: state.runsToday,
      dailyLimit: this.config.dailyLimit,
      consecutiveFailures: state.consecutiveFailures,
      nextRunAt: state.nextRunAt,
      lastRunAt: state.lastRunAt,
      lastSessionId: state.lastSessionId,
      activeSession: this.sessions.findActive()?.toSummary() ?? null,
      queuedCount: inbox.backlog.filter((item) => item.status === 'queued').length,
      pendingApprovalCount: inbox.approvals.filter((item) => item.status === 'pending').length,
    };
  }

  pause(): AutonomousWorkStatusResponse {
    this.clearTimer();
    this.stateStore.setPaused(true);
    this.logger.log('자율 업무를 일시정지했습니다. 진행 중인 업무는 계속됩니다.');
    return this.getStatus();
  }

  resume(): AutonomousWorkStatusResponse {
    if (!this.config.enabled) return this.getStatus();
    this.stateStore.setPaused(false);
    this.schedule(1_000);
    this.logger.log('자율 업무를 재개했습니다.');
    return this.getStatus();
  }

  runNow(): AutonomousWorkStatusResponse {
    const state = this.stateStore.reload();
    if (!this.config.enabled || state.paused || this.starting || this.sessions.findActive()) {
      return this.getStatus();
    }
    if (state.runsToday >= this.config.dailyLimit) return this.getStatus();
    this.clearTimer();
    // 과제 선정(LLM 호출)을 기다리지 않고 즉시 상태를 돌려줍니다 — 프론트는 폴링으로
    // 활성 세션을 따라잡으므로, 여기서 기다리면 로컬 모델 기준 버튼이 수 초~수십 초
    // 멈춘 것처럼 보입니다.
    void this.startAutonomousSession();
    return this.getStatus();
  }

  private schedule(delayMs: number): void {
    if (!this.config.enabled || this.stateStore.snapshot().paused) return;
    this.clearTimer();
    const delay = Math.max(1_000, delayMs);
    this.stateStore.setNextRunAt(new Date(Date.now() + delay));
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    this.timer = null;
    const state = this.stateStore.reload();
    if (state.paused) return;
    if (this.starting || this.sessions.findActive() || state.runsToday >= this.config.dailyLimit) {
      this.schedule(this.config.intervalMs);
      return;
    }
    await this.startAutonomousSession();
  }

  private async startAutonomousSession(): Promise<void> {
    this.starting = true;
    try {
      const state = this.stateStore.snapshot();
      const backlogItem = this.inbox.nextQueued();
      // 백로그 항목은 이미 사람이 쓴 브리프이므로 플래너를 타지 않습니다
      const brief = backlogItem
        ? backlogItem.brief
        : await this.briefPlanner.plan(state.recentBriefs);

      const session = this.workflow.createSession(brief);
      // 세션이 등록된 순간부터는 findActive() 가 중복 시작을 막아줍니다
      this.starting = false;

      if (backlogItem) this.inbox.markStarted(backlogItem.id, session.id);
      this.stateStore.recordRun(brief, session.id);
      this.stateStore.setNextRunAt(null);
      this.logger.log(`자율 업무를 시작했습니다: ${session.id}`);

      let finished = false;
      const finish = (event: SessionEvent): void => {
        if (finished) return;
        if (event.type !== 'done' && event.type !== 'error' && event.type !== 'cancelled') return;
        finished = true;
        if (event.type === 'done') {
          this.stateStore.recordSuccess();
          this.inbox.requestApproval(session.id, brief);
        } else {
          this.stateStore.recordFailure();
        }
        if (backlogItem) this.inbox.markFinished(backlogItem.id, event.type === 'done');
        this.clearSessionWatch();
        const failures = this.stateStore.snapshot().consecutiveFailures;
        const backoff = Math.min(this.config.intervalMs * 2 ** failures, 6 * 60 * 60 * 1000);
        this.schedule(backoff);
      };

      this.sessionSubscription = session.asObservable().subscribe({ next: finish });
      this.sessionTimeout = setTimeout(() => {
        this.logger.warn(`자율 업무 최대 실행 시간을 초과해 중단합니다: ${session.id}`);
        this.workflow.cancelSession(session.id);
      }, this.config.maxSessionMs);
      this.sessionTimeout.unref?.();
    } catch (error) {
      this.starting = false;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`자율 업무를 시작하지 못해 이번 주기를 건너뜁니다: ${message}`);
      this.schedule(this.config.intervalMs);
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private clearSessionWatch(): void {
    this.sessionSubscription?.unsubscribe();
    this.sessionSubscription = null;
    if (this.sessionTimeout) clearTimeout(this.sessionTimeout);
    this.sessionTimeout = null;
  }
}
