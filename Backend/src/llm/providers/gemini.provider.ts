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

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

interface GeminiErrorBody {
  error?: {
    message?: string;
    status?: string;
    details?: Array<{ '@type'?: string; retryDelay?: string }>;
  };
}

/**
 * Google Gemini (generateContent) 어댑터 — 무료 등급용 기본 프로바이더.
 *
 * Claude 와 두 가지가 다릅니다.
 *  - 시스템 프롬프트가 messages 가 아니라 `systemInstruction` 필드로 들어갑니다.
 *  - JSON 강제를 prefill 대신 `responseMimeType: application/json` 으로 합니다.
 *    (모델이 코드펜스나 설명을 덧붙일 여지가 아예 없어 더 안정적입니다)
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // LlmService 는 JSON 을 원할 때 prefill='{' 를 넘깁니다.
    // Gemini 에는 전용 JSON 모드가 있으므로 그쪽으로 바꿔 태웁니다.
    const wantsJson = request.prefill === '{';

    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4000,
        temperature: request.temperature ?? 0.7,
        ...(wantsJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const response = await this.send(body, request.signal);
    const candidate = response.candidates?.[0];

    if (!candidate) {
      const reason = response.promptFeedback?.blockReason;
      throw new LlmRequestError(
        reason
          ? `Gemini 가 요청을 거부했습니다 (${reason}).`
          : 'Gemini 응답에 결과가 없습니다.',
        400,
      );
    }

    if (candidate.finishReason === 'MAX_TOKENS') {
      this.logger.warn('출력이 maxOutputTokens 에서 잘렸습니다.');
    }

    const text = (candidate.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    return {
      text: text.trim(),
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        calls: 1,
      },
    };
  }

  private async send(body: unknown, signal?: AbortSignal): Promise<GeminiResponse> {
    const url = `${API_ROOT}/${encodeURIComponent(this.config.model)}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      throw new LlmTransientError(
        `Gemini 에 연결하지 못했습니다: ${redactSecrets(String(cause))}`,
      );
    }

    if (response.ok) return (await response.json()) as GeminiResponse;

    const raw = await response.text().catch(() => '');
    const message = redactSecrets(this.extractMessage(raw) || raw.slice(0, 300));

    if (response.status === 429) {
      // "limit: 0" 은 한도를 다 썼다는 뜻이 아니라 이 프로젝트에 무료 등급이
      // 아예 없다는 뜻입니다. 기다렸다 재시도해도 절대 회복되지 않으므로
      // 재시도 대상에서 빼고 해결 방법을 알려줍니다.
      if (this.hasNoFreeTierQuota(raw)) {
        throw new LlmRequestError(
          [
            'Gemini 무료 등급 한도가 0으로 설정된 프로젝트입니다. (재시도해도 회복되지 않습니다)',
            '이 API 키가 속한 Google Cloud 프로젝트에 결제가 연결되어 있으면 무료 등급이 사라집니다.',
            '해결: https://aistudio.google.com/apikey 에서 결제가 연결되지 않은 새 프로젝트를 만들어 키를 재발급하세요.',
            `원본 메시지: ${message}`,
          ].join('\n'),
          429,
        );
      }

      throw new LlmRateLimitError(
        `Gemini 한도를 초과했습니다. ${message}`,
        this.extractRetryDelayMs(raw, response.headers.get('retry-after')),
      );
    }
    if (response.status >= 500) {
      throw new LlmTransientError(`Gemini ${response.status}: ${message}`);
    }
    throw new LlmRequestError(`Gemini ${response.status}: ${message}`, response.status);
  }

  /** 무료 등급 한도가 0으로 잡혀 있는지 (= 재시도 무의미) */
  private hasNoFreeTierQuota(raw: string): boolean {
    return /free_tier[\w.]*"?[^\n]*limit:\s*0\b/.test(raw) || /limit:\s*0,\s*model:/.test(raw);
  }

  private extractMessage(raw: string): string {
    try {
      return (JSON.parse(raw) as GeminiErrorBody).error?.message ?? '';
    } catch {
      return '';
    }
  }

  /** 구글은 RetryInfo.retryDelay 에 "31s" 같은 문자열로 대기 시간을 줍니다 */
  private extractRetryDelayMs(raw: string, header: string | null): number | null {
    try {
      const details = (JSON.parse(raw) as GeminiErrorBody).error?.details ?? [];
      for (const detail of details) {
        const seconds = Number.parseFloat(detail.retryDelay?.replace('s', '') ?? '');
        if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
      }
    } catch {
      /* 헤더로 넘어감 */
    }

    const headerSeconds = Number.parseFloat(header ?? '');
    return Number.isFinite(headerSeconds) ? Math.ceil(headerSeconds * 1000) : null;
  }
}
