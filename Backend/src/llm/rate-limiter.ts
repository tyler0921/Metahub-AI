import { Logger } from '@nestjs/common';

export interface RateLimiterOptions {
  /** 동시에 진행할 수 있는 요청 수 */
  maxConcurrent: number;
  /** 분당 최대 요청 수. 0 이면 제한 없음 */
  requestsPerMinute: number;
}

interface QueuedTask {
  run: () => void;
}

/**
 * 무료 등급 한도를 넘지 않게 LLM 호출을 조절하는 게이트.
 *
 * 이 프로젝트는 초안·교차검토 단계에서 부서 수만큼 동시에 호출이 나갑니다.
 * 유료 등급에서는 문제없지만 무료 등급(분당 10~30회)에서는 그대로 429를 맞습니다.
 * 그래서 호출을 전부 이 게이트에 통과시켜
 *
 *   1) 동시 실행 수를 세마포어로 묶고
 *   2) 분당 호출 수를 슬라이딩 윈도로 제한하고
 *   3) 429 를 받으면 서버가 알려준 시간만큼 **모든** 호출을 멈춥니다.
 *
 * 3번이 중요합니다. 한 요청이 한도에 걸렸다면 나머지도 걸릴 것이므로,
 * 개별 재시도가 아니라 전체를 잠깐 세우는 편이 훨씬 빨리 회복됩니다.
 */
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  private active = 0;
  private readonly queue: QueuedTask[] = [];
  /** 최근 1분간 요청이 시작된 시각들 */
  private readonly recentStarts: number[] = [];
  /** 이 시각까지는 새 요청을 보내지 않는다 */
  private pausedUntil = 0;

  constructor(private readonly options: RateLimiterOptions) {}

  get pendingCount(): number {
    return this.queue.length;
  }

  /** 게이트를 통과한 뒤 작업을 실행합니다 */
  async acquire<T>(task: () => Promise<T>): Promise<T> {
    // 슬롯 예약은 waitForSlot 안에서 끝납니다.
    // 여기서 active++ 를 하면 await 이후(마이크로태스크)로 밀려서
    // 동시에 들어온 요청들이 전부 빈 자리를 본 것으로 착각합니다.
    await this.waitForSlot();

    try {
      return await task();
    } finally {
      this.active--;
      this.drain();
    }
  }

  /** 429 를 받았을 때 전체 호출을 잠시 멈춥니다 */
  pause(durationMs: number): void {
    const until = Date.now() + durationMs;
    if (until <= this.pausedUntil) return;

    this.pausedUntil = until;
    this.logger.warn(
      `한도 초과 — ${Math.ceil(durationMs / 1000)}초간 모든 LLM 호출을 멈춥니다. (대기 ${this.queue.length}건)`,
    );
  }

  /* ── 내부 ─────────────────────────────────────── */

  /**
   * 자리가 날 때까지 기다린 뒤 **슬롯을 잡은 상태로** 반환합니다.
   * 검사와 예약(active++)이 같은 동기 블록에서 일어나야 경쟁 조건이 없습니다.
   */
  private waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      const attempt = (): void => {
        const waitMs = this.blockedForMs();

        if (waitMs > 0) {
          // 아직 못 보냄 — 그만큼 기다렸다 다시 확인
          setTimeout(attempt, waitMs);
          return;
        }
        if (this.active >= this.options.maxConcurrent) {
          // 자리 없음 — 다른 작업이 끝나면 drain() 이 깨워준다
          this.queue.push({ run: attempt });
          return;
        }

        // 예약 확정
        this.active++;
        this.recentStarts.push(Date.now());
        resolve();
      };
      attempt();
    });
  }

  /** 지금 보낼 수 없다면 몇 ms 뒤에 가능한지 (0 이면 즉시 가능) */
  private blockedForMs(): number {
    const now = Date.now();

    if (now < this.pausedUntil) return this.pausedUntil - now;

    const { requestsPerMinute } = this.options;
    if (requestsPerMinute <= 0) return 0;

    // 1분보다 오래된 기록은 버린다
    const cutoff = now - 60_000;
    while (this.recentStarts.length > 0 && (this.recentStarts[0] ?? 0) < cutoff) {
      this.recentStarts.shift();
    }

    if (this.recentStarts.length < requestsPerMinute) return 0;

    // 가장 오래된 요청이 창 밖으로 나갈 때까지 대기
    const oldest = this.recentStarts[0] ?? now;
    return Math.max(50, oldest + 60_000 - now);
  }

  private drain(): void {
    if (this.queue.length === 0) return;
    if (this.active >= this.options.maxConcurrent) return;

    const next = this.queue.shift();
    next?.run();
  }
}
