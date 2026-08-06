import type { TokenUsage } from '@shared';

/** LLM 호출 옵션 */
export interface CompletionOptions {
  /** 대표가 세션을 중단하면 진행 중인 호출도 즉시 끊습니다 */
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** 응답 앞부분을 미리 채워 형식을 강제 (assistant prefill) */
  prefill?: string;
}

export interface CompletionRequest extends CompletionOptions {
  system: string;
  prompt: string;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
}

/**
 * LLM 프로바이더 계약.
 * 에이전트는 어떤 모델이 뒤에 있는지 알 필요가 없습니다.
 * 새 프로바이더(Ollama, OpenAI)를 추가하려면 이 인터페이스만 구현하면 됩니다.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** DI 토큰 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
