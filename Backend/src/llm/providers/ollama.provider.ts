import { Logger } from '@nestjs/common';
import type { LlmConfig } from '../../config/configuration';
import {
  LlmRequestError,
  LlmTransientError,
  mergeSignals,
  redactSecrets,
} from '../errors/llm.errors';
import type {
  CompletionRequest,
  CompletionResult,
  LlmProvider,
} from '../interfaces/llm-provider.interface';

interface OllamaResponse {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * 추론 모델이 흘린 사고 과정을 걷어냅니다.
 *
 * `think: false` 를 붙여도 구버전 Ollama 나 일부 모델은 본문에 `<think>` 를
 * 그대로 섞어 보냅니다. 이걸 안 걷어내면 사고 과정이 산출물 파일이나
 * Obsidian 노트에 그대로 저장됩니다.
 */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // 닫는 태그만 남은 경우 — 그 앞은 전부 사고 과정입니다
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim();
}

/**
 * Ollama 어댑터 — 내 PC 에서 도는 로컬 모델.
 *
 * API 키도, 요청 한도도, 토큰 비용도 없습니다. 대신 속도가 하드웨어에 달려 있고,
 * 첫 호출은 모델을 메모리에 올리느라 수십 초가 걸릴 수 있습니다.
 *
 * 클라우드 프로바이더와 다른 점:
 *  - 429 가 없습니다. 대신 **동시 호출을 1로 묶는 게 중요합니다.**
 *    Ollama 는 요청을 직렬 처리하므로 병렬로 던지면 큐에 쌓여 오히려 느려집니다.
 *  - JSON 강제는 `format: 'json'` 으로 합니다.
 *  - 서버가 안 떠 있으면 ECONNREFUSED 가 나므로, 그 경우 설치·실행 방법을 안내합니다.
 *  - qwen3 계열은 추론(thinking) 모델이라 `<think>` 블록을 앞에 답니다.
 *    `think: false` 로 끄고, 그래도 새어 나오면 응답에서 걷어냅니다.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private warmed = false;

  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model;
  }

  private get chatUrl(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/api/chat`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // LlmService 는 JSON 을 원할 때 prefill='{' 를 넘깁니다.
    const wantsJson = request.prefill === '{';

    if (!this.warmed) {
      this.logger.log(
        `첫 호출입니다. ${this.config.model} 을 메모리에 올리는 동안 시간이 걸릴 수 있습니다.`,
      );
    }

    const body = {
      model: this.config.model,
      stream: false,
      // 추론 모델의 사고 과정은 산출물에 필요 없습니다 (지원 안 하는 모델은 무시)
      think: false,
      ...(wantsJson ? { format: 'json' } : {}),
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 4000,
        // 지정하지 않으면 4096 으로 잘려 프롬프트 앞부분이 사라집니다
        num_ctx: this.config.contextWindow,
      },
    };

    const response = await this.send(body, request.signal);
    this.warmed = true;

    if (response.error) {
      throw new LlmRequestError(this.explainModelError(response.error), 400);
    }
    if (response.done_reason === 'length') {
      this.logger.warn('출력이 num_predict 에서 잘렸습니다.');
    }

    return {
      text: stripThinking(response.message?.content ?? ''),
      usage: {
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
        calls: 1,
      },
    };
  }

  private async send(body: unknown, signal?: AbortSignal): Promise<OllamaResponse> {
    let response: Response;
    try {
      response = await fetch(this.chatUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        // 로컬 모델은 느릴 수 있으므로 넉넉하게 잡습니다
        signal: mergeSignals(AbortSignal.timeout(this.config.timeoutMs), signal),
      });
    } catch (cause) {
      throw this.explainConnectionError(cause);
    }

    if (response.ok) return (await response.json()) as OllamaResponse;

    const raw = redactSecrets((await response.text().catch(() => '')).slice(0, 400));

    if (response.status === 404) {
      throw new LlmRequestError(this.explainModelError(raw), 404);
    }
    if (response.status >= 500) {
      throw new LlmTransientError(`Ollama ${response.status}: ${raw}`);
    }
    throw new LlmRequestError(`Ollama ${response.status}: ${raw}`, response.status);
  }

  /** 서버가 안 떠 있거나 응답이 너무 느릴 때 무엇을 해야 하는지 알려줍니다 */
  private explainConnectionError(cause: unknown): Error {
    const text = String(cause);

    if (/TimeoutError|aborted|AbortError/i.test(text)) {
      return new LlmTransientError(
        [
          `Ollama 응답이 ${Math.round(this.config.timeoutMs / 1000)}초 안에 오지 않았습니다.`,
          '모델이 너무 크거나 첫 로딩 중일 수 있습니다.',
          '더 작은 모델(예: qwen3:4b)로 바꾸거나 OLLAMA_TIMEOUT_MS 를 늘려보세요.',
        ].join(' '),
      );
    }

    return new LlmRequestError(
      [
        `Ollama 서버에 연결하지 못했습니다 (${this.config.baseUrl}).`,
        '',
        '1) 설치:  https://ollama.com/download',
        `2) 모델:  ollama pull ${this.config.model}`,
        '3) 실행:  ollama serve   (설치 시 보통 자동으로 실행됩니다)',
        '4) 확인:  http://localhost:11434 접속 시 "Ollama is running" 이 보이면 정상입니다',
        '',
        `원인: ${redactSecrets(text)}`,
      ].join('\n'),
      503,
    );
  }

  /** 모델을 아직 내려받지 않은 경우 */
  private explainModelError(detail: string): string {
    if (/not found|no such model|pull/i.test(detail)) {
      return [
        `모델 "${this.config.model}" 을 찾을 수 없습니다.`,
        `먼저 내려받으세요:  ollama pull ${this.config.model}`,
        `설치된 모델 확인:  ollama list`,
        '',
        `원본: ${detail}`,
      ].join('\n');
    }
    return `Ollama: ${detail}`;
  }
}
