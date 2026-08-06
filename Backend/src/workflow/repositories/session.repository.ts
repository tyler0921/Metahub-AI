import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowConfig } from '../../config/configuration';
import { WorkSessionEntity } from '../entities/work-session.entity';

/**
 * 세션 저장소 (인메모리).
 *
 * 인터페이스가 단순하므로 Redis 나 RDB 로 바꾸더라도
 * WorkflowService 코드는 손대지 않아도 됩니다.
 */
@Injectable()
export class SessionRepository implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRepository.name);
  private readonly sessions = new Map<string, WorkSessionEntity>();
  private readonly sweeper: NodeJS.Timeout;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.ttlMs = config.getOrThrow<WorkflowConfig>('workflow').sessionTtlMs;
    // 오래된 세션을 주기적으로 비워 메모리 누수를 막는다
    this.sweeper = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  create(brief: string, parentSessionId?: string): WorkSessionEntity {
    // 후속 지시면 원본 산출물을 물려받아 처음부터 다시 하지 않습니다
    const parent = parentSessionId ? this.sessions.get(parentSessionId) : undefined;
    if (parentSessionId && !parent) {
      throw new NotFoundException(`이어서 작업할 세션을 찾을 수 없습니다: ${parentSessionId}`);
    }

    const session = new WorkSessionEntity(
      brief,
      parent?.id ?? null,
      parent?.result ?? null,
    );
    this.sessions.set(session.id, session);
    return session;
  }

  findById(id: string): WorkSessionEntity {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException(`세션을 찾을 수 없습니다: ${id}`);
    return session;
  }

  findRecent(limit = 20): WorkSessionEntity[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  private sweep(): void {
    const deadline = Date.now() - this.ttlMs;
    let removed = 0;

    for (const [id, session] of this.sessions) {
      const finished = session.status === 'completed' || session.status === 'failed';
      if (finished && session.createdAt.getTime() < deadline) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.logger.log(`만료된 세션 ${removed}건을 정리했습니다.`);
  }
}
