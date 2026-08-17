import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AutonomousWorkConfig } from '../config/configuration';
import { SessionRepository } from './repositories/session.repository';
import { WorkflowService } from './workflow.service';

const AUTONOMOUS_BRIEFS = [
  '[자율 업무] 최근 업무 기록과 산출물을 검토하고, 회사 운영 품질을 가장 크게 높일 수 있는 개선 과제 하나를 스스로 선정해 실행한 뒤 결과와 다음 행동을 보고해줘.',
  '[자율 업무] 현재 서비스와 사용자 경험을 점검하고, 사용자가 바로 체감할 수 있는 개선 기회 하나를 찾아 구체적인 실행안과 산출물로 완성해줘.',
  '[자율 업무] 사내 지식과 최근 프로젝트를 검토해 누락된 위험, 반복되는 비효율 또는 새 기회를 하나 발굴하고 관련 부서가 협업해 해결 결과를 보고해줘.',
] as const;

@Injectable()
export class AutonomousWorkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutonomousWorkService.name);
  private readonly config: AutonomousWorkConfig;
  private timer: NodeJS.Timeout | null = null;
  private dayKey = '';
  private runsToday = 0;

  constructor(
    config: ConfigService,
    private readonly sessions: SessionRepository,
    private readonly workflow: WorkflowService,
  ) {
    this.config = config.getOrThrow<AutonomousWorkConfig>('autonomousWork');
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('자율 업무 모드가 꺼져 있습니다.');
      return;
    }
    this.logger.log(
      `자율 업무 모드 시작 (하루 최대 ${this.config.dailyLimit}회, ` +
      `${Math.round(this.config.intervalMs / 60_000)}분 간격)`,
    );
    this.schedule(this.config.startupDelayMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => this.tick(), delayMs);
    this.timer.unref?.();
  }

  private tick(): void {
    this.refreshDailyCounter();
    const active = this.sessions.findActive();

    if (active) {
      this.logger.debug(`진행 중인 세션 ${active.id}이 있어 자율 업무를 건너뜁니다.`);
    } else if (this.runsToday >= this.config.dailyLimit) {
      this.logger.debug('오늘의 자율 업무 한도에 도달했습니다.');
    } else {
      const brief = AUTONOMOUS_BRIEFS[this.runsToday % AUTONOMOUS_BRIEFS.length];
      this.runsToday += 1;
      const session = this.workflow.createSession(brief);
      this.logger.log(`자율 업무를 시작했습니다: ${session.id}`);
    }

    this.schedule(this.config.intervalMs);
  }

  private refreshDailyCounter(): void {
    const key = new Date().toISOString().slice(0, 10);
    if (key === this.dayKey) return;
    this.dayKey = key;
    this.runsToday = 0;
  }
}
