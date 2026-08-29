import { Logger } from '@nestjs/common';
import type { VaultConfig } from '../../config/configuration';

interface OllamaEmbedResponse {
  embeddings?: number[][];
  error?: string;
}

/**
 * 볼트 회상용 임베딩 클라이언트.
 *
 * 채팅 프로바이더가 무엇이든(ollama/gemini/groq/claude) 임베딩은 항상 로컬 Ollama 를
 * 씁니다 — 회상은 비용 없이 자주 도는 경로라 클라우드 임베딩 API 를 얹으면 매 세션마다
 * 과금이 붙습니다.
 *
 * 실패(서버 미기동, 모델 미설치, 타임아웃)는 절대 던지지 않고 `null` 을 돌려줍니다.
 * 호출부(`VaultService.recall`)는 이 경우 키워드 전용 회상으로 조용히 되돌아갑니다.
 * 로그도 매 회상마다 찍으면 서버가 안 떠 있는 동안 로그가 도배되므로 프로세스당 한 번만.
 */
export class OllamaEmbeddingProvider {
  private readonly logger = new Logger(OllamaEmbeddingProvider.name);
  private warnedOnce = false;

  constructor(private readonly config: VaultConfig) {}

  /** 입력과 같은 길이의 배열을 돌려줍니다. 실패한 항목은 null. */
  async embed(texts: string[]): Promise<(number[] | null)[]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch(this.embedUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.config.embeddingModel, input: texts }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const raw = await response.text().catch(() => '');
        this.warnOnce(`Ollama 임베딩 ${response.status}: ${raw.slice(0, 300)}`);
        return texts.map(() => null);
      }

      const body = (await response.json()) as OllamaEmbedResponse;
      if (body.error || !Array.isArray(body.embeddings)) {
        this.warnOnce(`Ollama 임베딩 응답 이상: ${body.error ?? '벡터 없음'}`);
        return texts.map(() => null);
      }
      if (body.embeddings.length !== texts.length) {
        this.warnOnce('Ollama 임베딩 응답 개수가 요청과 다릅니다.');
        return texts.map(() => null);
      }
      return body.embeddings;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.warnOnce(
        `Ollama 임베딩 서버(${this.config.embeddingBaseUrl})에 연결하지 못했습니다 — ` +
          `키워드 검색으로 대체합니다. (모델: ${this.config.embeddingModel}, ` +
          `설치: ollama pull ${this.config.embeddingModel}) 원인: ${message}`,
      );
      return texts.map(() => null);
    }
  }

  private get embedUrl(): string {
    return `${this.config.embeddingBaseUrl.replace(/\/$/, '')}/api/embed`;
  }

  private warnOnce(message: string): void {
    if (this.warnedOnce) return;
    this.warnedOnce = true;
    this.logger.warn(message);
  }
}
