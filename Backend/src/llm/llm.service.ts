import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TokenUsage } from '@shared';
import type { LlmConfig } from '../config/configuration';
import { buildDateContext } from '../common/utils/date.util';
import {
  LlmCancelledError,
  LlmRateLimitError,
  LlmRequestError,
  LlmTransientError,
} from './errors/llm.errors';
import {
  LLM_PROVIDER,
  type CompletionOptions,
  type LlmProvider,
} from './interfaces/llm-provider.interface';
import { RateLimiter } from './rate-limiter';
import type { UsageTracker } from './usage.tracker';

/**
 * LLM 파사드.
 *
 * 상위 계층(워크플로 단계)은 이 서비스만 알면 되고
 * 어떤 프로바이더가 주입됐는지, 한도를 어떻게 지키는지는 신경 쓰지 않습니다.
 *
 * 책임:
 *  - RateLimiter 를 통과시켜 무료 등급 한도를 지킨다
 *  - 429/5xx 를 재시도하고, 429 는 게이트 전체를 잠시 멈춘다
 *  - JSON 응답을 안전하게 파싱한다
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly config: LlmConfig;
  private readonly limiter: RateLimiter;

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<LlmConfig>('llm');
    this.limiter = new RateLimiter({
      maxConcurrent: this.config.maxConcurrent,
      requestsPerMinute: this.config.requestsPerMinute,
    });
  }

  get providerName(): string {
    return this.provider.name;
  }

  get model(): string {
    return this.provider.model;
  }

  /** 자유 형식 텍스트 응답 */
  async complete(
    system: string,
    prompt: string,
    options: CompletionOptions = {},
    tracker?: UsageTracker,
  ): Promise<string> {
    const result = await this.callWithRetry(
      () =>
        this.provider.complete({
          system: this.withDateContext(system),
          prompt,
          ...options,
        }),
      options.signal,
    );
    tracker?.add(result.usage);
    return result.text;
  }

  /**
   * 구조화된 JSON 응답.
   * prefill='{' 는 Claude 에서는 assistant 프리필로, Gemini 에서는
   * responseMimeType=application/json 으로 각 프로바이더가 알아서 번역합니다.
   */
  async completeJson<T>(
    system: string,
    prompt: string,
    options: CompletionOptions = {},
    tracker?: UsageTracker,
  ): Promise<T> {
    const raw = await this.complete(
      system,
      `${prompt}\n\n반드시 유효한 JSON만 출력하세요. 설명이나 코드펜스를 붙이지 마세요.`,
      { ...options, temperature: options.temperature ?? 0.2, prefill: '{' },
      tracker,
    );
    return this.parse<T>(raw);
  }

  /* ── 한도 대응 ────────────────────────────────── */

  private async callWithRetry<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // 대기열에서 차례를 기다리는 사이에 중단됐을 수 있습니다
      if (signal?.aborted) throw new LlmCancelledError();

      try {
        return await this.limiter.acquire(task);
      } catch (error) {
        // 대표가 중단한 것이라면 오류가 아니므로 재시도하지 않습니다
        if (signal?.aborted) throw new LlmCancelledError();

        // 요청 자체가 잘못된 경우는 재시도해도 소용없다
        if (error instanceof LlmRequestError) {
          throw new ServiceUnavailableException(error.message);
        }

        if (error instanceof LlmRateLimitError) {
          lastError = error;
          // 한 요청이 걸렸으면 나머지도 걸린다 — 게이트 전체를 세운다
          const waitMs = error.retryAfterMs ?? this.backoffMs(attempt);
          this.limiter.pause(waitMs);
          if (attempt === this.config.maxRetries) break;
          await this.sleep(waitMs, signal);
          continue;
        }

        if (error instanceof LlmTransientError) {
          lastError = error;
          if (attempt === this.config.maxRetries) break;
          this.logger.warn(
            `일시 오류 — ${attempt + 1}회차 재시도 (${this.config.maxRetries}회 중)`,
          );
          await this.sleep(this.backoffMs(attempt), signal);
          continue;
        }

        throw error;
      }
    }

    throw new ServiceUnavailableException(
      `LLM 호출에 ${this.config.maxRetries + 1}회 실패했습니다. ${lastError?.message ?? ''}`,
    );
  }

  private backoffMs(attempt: number): number {
    // 1.2s → 2.4s → 4.8s (+ 지터로 동시 재시도 분산)
    return 1200 * 2 ** attempt + Math.floor(Math.random() * 400);
  }

  /** 중단 신호가 오면 남은 대기 시간을 기다리지 않고 즉시 깨어납니다 */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new LlmCancelledError());

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new LlmCancelledError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /* ── 파싱 ─────────────────────────────────────── */

  /** 모델이 코드펜스나 잡담을 섞어도 최대한 건져냅니다 */
  private parse<T>(raw: string): T {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1)) as T;
        } catch {
          /* 아래에서 처리 */
        }
      }
      this.logger.error(`JSON 파싱 실패: ${cleaned.slice(0, 200)}`);
      throw new InternalServerErrorException(
        'AI 응답을 JSON으로 해석하지 못했습니다.',
      );
    }
  }

  static emptyUsage(): TokenUsage {
    return { inputTokens: 0, outputTokens: 0, calls: 0 };
  }

  /** 모든 LLM 호출에 "오늘" 날짜 컨텍스트를 붙입니다 */
  private withDateContext(system: string): string {
    return `${buildDateContext()}\n\n${system}`;
  }
}
