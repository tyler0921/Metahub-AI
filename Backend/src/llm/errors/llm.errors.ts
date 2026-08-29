/**
 * LLM 계층 전용 예외.
 *
 * 프로바이더는 재시도를 스스로 하지 않고 이 예외만 던집니다.
 * 언제 얼마나 기다렸다 다시 부를지는 RateLimiter 와 LlmService 가 결정합니다.
 * (재시도 정책이 프로바이더마다 흩어지지 않게 하기 위함)
 */

/** 429 — 한도 초과. 무료 등급에서 가장 자주 만나는 상황 */
export class LlmRateLimitError extends Error {
  constructor(
    message: string,
    /** 서버가 알려준 대기 시간. 모르면 null */
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = 'LlmRateLimitError';
  }
}

/** 5xx / 네트워크 오류 — 잠시 뒤 재시도하면 될 수 있음 */
export class LlmTransientError extends Error {
  constructor(
    message: string,
    /** 알려준 대기 시간. 모르면 null 이고 기본 backoff 을 씁니다 */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'LlmTransientError';
  }
}

/** 4xx — 요청 자체가 잘못됨. 재시도해도 소용없음 */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

/** 대표가 세션을 중단해서 끊긴 호출 — 재시도하면 안 됩니다 */
export class LlmCancelledError extends Error {
  constructor() {
    super('대표 지시로 작업이 중단되었습니다.');
    this.name = 'LlmCancelledError';
  }
}

/**
 * 타임아웃 신호와 취소 신호를 하나로 합칩니다.
 * (둘 중 아무거나 먼저 발동하면 요청이 끊깁니다)
 */
export function mergeSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const live = signals.filter((s): s is AbortSignal => s !== undefined);
  if (live.length === 0) return undefined;
  if (live.length === 1) return live[0];
  return AbortSignal.any(live);
}

/** 오류 메시지에 API 키가 섞여 나가지 않도록 가립니다 */
export function redactSecrets(text: string): string {
  return text
    .replace(/key=[\w-]+/gi, 'key=***')
    .replace(/sk-[\w-]{8,}/gi, 'sk-***')
    .replace(/AIza[\w-]{8,}/g, 'AIza***');
}
