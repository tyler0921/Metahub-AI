import { Logger } from '@nestjs/common';
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

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface GroqResponse {
  choices?: GroqChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface GroqErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

/**
 * Groq 어댑터 — 신용카드 없이 쓸 수 있는 두 번째 무료 프로바이더.
 *
 * OpenAI 호환 API 라서 형태가 단순합니다. Gemini 와 마찬가지로
 * JSON 강제는 프리필 대신 `response_format: json_object` 로 처리합니다.
 *
 * 주의: 무료 등급의 병목은 요청 수가 아니라 **분당 토큰(TPM)** 입니다.
 * llama-3.3-70b 기준 12K TPM 이라, 이 앱처럼 긴 프롬프트를 여러 번 던지면
 * 분당 3~4회가 현실적인 상한입니다. (기본값이 그렇게 잡혀 있습니다)
 */
export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqProvider.name);

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // LlmService 는 JSON 을 원할 때 prefill='{' 를 넘깁니다.
    const wantsJson = request.prefill === '{';

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.7,
      ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
    };

    const response = await this.send(body, request.signal);
    const choice = response.choices?.[0];

    if (!choice) {
      throw new LlmRequestError('Groq 응답에 결과가 없습니다.', 400);
    }
    if (choice.finish_reason === 'length') {
      this.logger.warn('출력이 max_tokens 에서 잘렸습니다.');
    }

    return {
      text: (choice.message?.content ?? '').trim(),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        calls: 1,
      },
    };
  }

  private async send(body: unknown, signal?: AbortSignal): Promise<GroqResponse> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      throw new LlmTransientError(
        `Groq 에 연결하지 못했습니다: ${redactSecrets(String(cause))}`,
      );
    }

    if (response.ok) return (await response.json()) as GroqResponse;

    const raw = await response.text().catch(() => '');
    const message = redactSecrets(this.extractMessage(raw) || raw.slice(0, 300));

    if (response.status === 429) {
      // 하루 한도(RPD)를 다 쓴 경우는 기다려도 그날 안에 회복되지 않습니다
      if (/per day|daily|RPD/i.test(message)) {
        throw new LlmRequestError(
          `Groq 일일 한도를 모두 사용했습니다. 내일 초기화됩니다. ${message}`,
          429,
        );
      }
      const retryAfter = Number.parseFloat(response.headers.get('retry-after') ?? '');
      throw new LlmRateLimitError(
        `Groq 한도를 초과했습니다. ${message}`,
        Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : null,
      );
    }
    if (response.status >= 500) {
      throw new LlmTransientError(`Groq ${response.status}: ${message}`);
    }
    throw new LlmRequestError(`Groq ${response.status}: ${message}`, response.status);
  }

  private extractMessage(raw: string): string {
    try {
      return (JSON.parse(raw) as GroqErrorBody).error?.message ?? '';
    } catch {
      return '';
    }
  }
}
