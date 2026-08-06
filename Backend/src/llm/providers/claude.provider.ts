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

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic Messages API 어댑터.
 *
 * 재시도는 하지 않습니다. 한도·일시 오류를 타입이 있는 예외로 올리면
 * LlmService 와 RateLimiter 가 대기와 재시도를 처리합니다.
 */
export class ClaudeProvider implements LlmProvider {
  readonly name = 'claude';

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: request.prompt },
    ];
    // assistant 턴을 미리 채워 응답 형식을 강제 (JSON 앞의 잡담 방지)
    if (request.prefill) {
      messages.push({ role: 'assistant', content: request.prefill });
    }

    const response = await this.send({
      model: this.config.model,
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.7,
      system: request.system,
      messages,
    }, request.signal);

    const text = (response.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      // prefill 은 응답에 포함되지 않으므로 직접 이어 붙인다
      text: (request.prefill ? request.prefill + text : text).trim(),
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        calls: 1,
      },
    };
  }

  private async send(body: unknown, signal?: AbortSignal): Promise<AnthropicResponse> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      throw new LlmTransientError(
        `Claude 에 연결하지 못했습니다: ${redactSecrets(String(cause))}`,
      );
    }

    if (response.ok) return (await response.json()) as AnthropicResponse;

    const detail = redactSecrets((await response.text().catch(() => '')).slice(0, 300));

    if (response.status === 429) {
      const retryAfter = Number.parseFloat(response.headers.get('retry-after') ?? '');
      throw new LlmRateLimitError(
        `Claude 한도를 초과했습니다. ${detail}`,
        Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : null,
      );
    }
    if (response.status >= 500) {
      throw new LlmTransientError(`Claude ${response.status}: ${detail}`);
    }
    throw new LlmRequestError(`Claude ${response.status}: ${detail}`, response.status);
  }
}
