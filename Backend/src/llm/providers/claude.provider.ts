import Anthropic from '@anthropic-ai/sdk';
import type { LlmConfig } from '../../config/configuration';
import {
  LlmRateLimitError,
  LlmRequestError,
  LlmTransientError,
  redactSecrets,
} from '../errors/llm.errors';
import type {
  CompletionRequest,
  CompletionResult,
  LlmProvider,
} from '../interfaces/llm-provider.interface';

/**
 * 거절(refusal) 시 서버가 다른 모델로 이어서 답하게 할 수 있는 모델.
 * 그 밖의 모델에 fallbacks 를 보내면 400 이 납니다.
 */
const DEFAULT_FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/**
 * 최신 모델은 생각(thinking)이 항상 켜져 있고 그 토큰도 max_tokens 에 들어갑니다.
 * 호출부가 정한 값만 주면 답을 쓰다 잘리므로 바닥을 깔아 둡니다.
 */
const MIN_MAX_TOKENS = 16_000;

/**
 * Anthropic Messages API 어댑터 (공식 SDK).
 *
 * 재시도는 하지 않습니다(maxRetries: 0). 한도·일시 오류를 타입이 있는 예외로 올리면
 * LlmService 와 RateLimiter 가 대기와 재시도를 처리합니다.
 *
 * 다른 프로바이더와 다른 점:
 *  - 최신 Claude 는 assistant prefill 과 temperature 를 받지 않습니다(400).
 *    JSON 은 LlmService 가 프롬프트에 붙이는 지시로 받고, 파싱도 LlmService 가 합니다.
 */
export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(private readonly config: LlmConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, maxRetries: 0 });
  }

  get model(): string {
    return this.config.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const useFallback = DEFAULT_FALLBACK_MODELS.has(this.config.model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.config.model,
          max_tokens: Math.max(request.maxTokens ?? 4000, MIN_MAX_TOKENS),
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          ...(useFallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal: request.signal },
      );
    } catch (error) {
      throw this.translate(error);
    }

    if (response.stop_reason === 'refusal') {
      throw new LlmRequestError('Claude 가 이 요청에 답하지 않았습니다. 지시 내용을 바꿔 다시 시도해 주세요.', 400);
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text: text.trim(),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        calls: 1,
      },
    };
  }

  /** SDK 예외를 LlmService 가 아는 재시도 분류로 바꿉니다 */
  private translate(error: unknown): unknown {
    // 중단은 LlmService 가 signal 로 직접 판단하므로 그대로 올립니다
    if (error instanceof Anthropic.APIUserAbortError) return error;

    if (error instanceof Anthropic.RateLimitError) {
      const retryAfter = Number.parseFloat(error.headers?.get('retry-after') ?? '');
      return new LlmRateLimitError(
        `Claude 한도를 초과했습니다. ${redactSecrets(error.message)}`,
        Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : null,
      );
    }
    if (error instanceof Anthropic.InternalServerError) {
      return new LlmTransientError(`Claude ${error.status}: ${redactSecrets(error.message)}`);
    }
    // TypeScript SDK 에서는 연결 오류도 APIError 의 하위 클래스라 먼저 걸러야 합니다
    if (error instanceof Anthropic.APIConnectionError) {
      return new LlmTransientError(`Claude 에 연결하지 못했습니다: ${redactSecrets(error.message)}`);
    }
    if (error instanceof Anthropic.APIError) {
      return new LlmRequestError(
        `Claude ${error.status ?? ''}: ${redactSecrets(error.message)}`,
        error.status ?? 400,
      );
    }
    return error;
  }
}
