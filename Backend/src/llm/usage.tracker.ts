import type { TokenUsage } from '@shared';

type UsageListener = (snapshot: TokenUsage, delta: TokenUsage) => void;

/**
 * 세션 단위 토큰 사용량 누적기.
 *
 * LlmService 를 싱글턴으로 두고 사용량은 세션마다 따로 세야 하므로,
 * 누적 상태를 서비스가 아니라 이 값 객체가 들고 다닙니다.
 * 호출이 쌓일 때마다 리스너로 SSE `usage` 이벤트를 흘립니다.
 */
export class UsageTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private calls = 0;
  private listener: UsageListener | null = null;

  /** 세션이 만들어질 때 한 번 붙입니다 */
  onChange(listener: UsageListener): void {
    this.listener = listener;
  }

  add(usage: TokenUsage): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.calls += usage.calls;
    this.listener?.(this.snapshot(), { ...usage });
  }

  snapshot(): TokenUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      calls: this.calls,
    };
  }
}
