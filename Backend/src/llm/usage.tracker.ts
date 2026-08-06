import type { TokenUsage } from '@shared';

/**
 * 세션 단위 토큰 사용량 누적기.
 *
 * LlmService 를 싱글턴으로 두고 사용량은 세션마다 따로 세야 하므로,
 * 누적 상태를 서비스가 아니라 이 값 객체가 들고 다닙니다.
 */
export class UsageTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private calls = 0;

  add(usage: TokenUsage): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.calls += usage.calls;
  }

  snapshot(): TokenUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      calls: this.calls,
    };
  }
}
