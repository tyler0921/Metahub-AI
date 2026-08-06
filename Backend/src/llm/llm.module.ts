import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmConfig } from '../config/configuration';
import {
  LLM_PROVIDER,
  type LlmProvider,
} from './interfaces/llm-provider.interface';
import { LlmService } from './llm.service';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { MockProvider } from './providers/mock.provider';
import { OllamaProvider } from './providers/ollama.provider';

/**
 * 설정에 따라 구현체를 갈아끼우는 팩토리.
 * 새 프로바이더(Groq, Ollama 등)를 추가하려면
 * LlmProvider 를 구현하고 여기 분기 하나만 늘리면 됩니다.
 */
const llmProviderFactory: Provider = {
  provide: LLM_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): LlmProvider => {
    const config = configService.getOrThrow<LlmConfig>('llm');
    const logger = new Logger('LlmModule');
    const limits = `동시 ${config.maxConcurrent}건 · 분당 ${config.requestsPerMinute || '무제한'}`;

    switch (config.provider) {
      case 'ollama':
        logger.log(`OllamaProvider 주입 (${config.model} @ ${config.baseUrl}, ${limits})`);
        return new OllamaProvider(config);

      case 'gemini':
        logger.log(`GeminiProvider 주입 (${config.model}, ${limits})`);
        return new GeminiProvider(config);

      case 'groq':
        logger.log(`GroqProvider 주입 (${config.model}, ${limits})`);
        return new GroqProvider(config);

      case 'claude':
        logger.log(`ClaudeProvider 주입 (${config.model}, ${limits})`);
        return new ClaudeProvider(config);

      default:
        logger.warn('MockProvider 주입 — 실제 AI 호출이 일어나지 않습니다.');
        return new MockProvider();
    }
  },
};

@Module({
  providers: [llmProviderFactory, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
