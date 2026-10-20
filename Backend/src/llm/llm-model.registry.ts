import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmModelOption } from '@shared';
import {
  availableLlmProviders,
  defaultModelOf,
  llmConfigFor,
  type LlmConfig,
  type LlmProviderName,
} from '../config/configuration';
import { readJsonFileOrDefault, writeJsonFileAtomic } from '../common/utils/json-file-store';
import type { LlmProvider } from './interfaces/llm-provider.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { MockProvider } from './providers/mock.provider';
import { OllamaProvider } from './providers/ollama.provider';

interface SelectionState {
  version: 1;
  provider: LlmProviderName;
  model: string;
}

/** 화면에 내놓는 Claude 모델 — .env 에 다른 모델을 적었다면 그것도 함께 나옵니다 */
const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

/** Ollama 목록을 기다리는 최대 시간. 꺼져 있으면 드롭다운이 멈춰 보이면 안 됩니다 */
const OLLAMA_LIST_TIMEOUT_MS = 2_000;

export class LlmSelectionError extends Error {}

/**
 * 지금 일하는 LLM 을 들고 있는 곳.
 *
 * 서버가 뜰 때는 .env 로 정하고, 화면에서 모델을 고르면 여기서 갈아끼웁니다.
 * 고른 값은 파일에 남겨 서버를 다시 켜도 그대로 씁니다.
 */
@Injectable()
export class LlmModelRegistry {
  private readonly logger = new Logger(LlmModelRegistry.name);
  private readonly statePath: string;
  private currentConfig: LlmConfig;
  private currentProvider: LlmProvider;

  constructor(configService: ConfigService) {
    const base = configService.getOrThrow<LlmConfig>('llm');
    this.statePath = base.selectionStatePath;
    this.currentConfig = this.restore() ?? base;
    this.currentProvider = this.createProvider(this.currentConfig);
  }

  get config(): LlmConfig {
    return this.currentConfig;
  }

  get provider(): LlmProvider {
    return this.currentProvider;
  }

  /** 드롭다운에 보여줄 모델 — 키가 있는 프로바이더와 설치된 Ollama 모델만 */
  async listOptions(): Promise<LlmModelOption[]> {
    const options: LlmModelOption[] = [];
    for (const provider of availableLlmProviders()) {
      for (const model of await this.modelsOf(provider)) {
        options.push({ provider, model });
      }
    }

    // 목록에서 빠졌더라도(Ollama 를 꺼 둔 경우 등) 지금 쓰는 모델은 보여야 합니다
    const { provider, model } = this.currentConfig;
    if (!options.some((o) => o.provider === provider && o.model === model)) {
      options.unshift({ provider, model });
    }
    return options;
  }

  async select(provider: string, model: string): Promise<void> {
    const options = await this.listOptions();
    const match = options.find((o) => o.provider === provider && o.model === model);
    if (!match) {
      throw new LlmSelectionError('고를 수 없는 모델입니다. 목록을 새로 불러온 뒤 다시 골라 주세요.');
    }

    // 목록은 availableLlmProviders() 에서만 만들어지므로 이름이 보장됩니다
    const providerName = match.provider as LlmProviderName;
    this.currentConfig = llmConfigFor(providerName, match.model);
    this.currentProvider = this.createProvider(this.currentConfig);
    writeJsonFileAtomic(this.statePath, {
      version: 1,
      provider: providerName,
      model: match.model,
    } satisfies SelectionState);
    this.logger.log(`모델 변경 → ${match.provider} (${match.model})`);
  }

  private async modelsOf(provider: LlmProviderName): Promise<string[]> {
    if (provider === 'mock') return ['mock'];
    if (provider === 'claude') {
      return [...new Set([defaultModelOf('claude'), ...CLAUDE_MODELS])];
    }
    if (provider === 'ollama') {
      const installed = await this.installedOllamaModels();
      return installed.length > 0 ? installed : [defaultModelOf('ollama')];
    }
    return [defaultModelOf(provider)];
  }

  /** 내 PC 에 받아 둔 Ollama 모델. 임베딩 전용 모델은 대화를 못 하므로 뺍니다 */
  private async installedOllamaModels(): Promise<string[]> {
    const baseUrl = llmConfigFor('ollama').baseUrl.replace(/\/$/, '');
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(OLLAMA_LIST_TIMEOUT_MS),
      });
      if (!response.ok) return [];
      const body = (await response.json()) as { models?: Array<{ name?: string }> };
      return (body.models ?? [])
        .map((m) => m.name ?? '')
        .filter((name) => name && !/embed/i.test(name))
        .sort();
    } catch {
      return [];
    }
  }

  /** 저장해 둔 선택이 아직 쓸 수 있을 때만 되살립니다 (키를 지웠다면 .env 를 따릅니다) */
  private restore(): LlmConfig | null {
    const saved = readJsonFileOrDefault<Partial<SelectionState>>(this.statePath, {}, (error) =>
      this.logger.warn(`고른 모델을 읽지 못했습니다: ${String(error)}`),
    );
    if (saved.version !== 1 || !saved.provider || !saved.model) return null;
    if (!availableLlmProviders().includes(saved.provider)) return null;
    return llmConfigFor(saved.provider, saved.model);
  }

  private createProvider(config: LlmConfig): LlmProvider {
    const limits = `동시 ${config.maxConcurrent}건 · 분당 ${config.requestsPerMinute || '무제한'}`;

    switch (config.provider) {
      case 'ollama':
        this.logger.log(`OllamaProvider 사용 (${config.model} @ ${config.baseUrl}, ${limits})`);
        return new OllamaProvider(config);

      case 'gemini':
        this.logger.log(`GeminiProvider 사용 (${config.model}, ${limits})`);
        return new GeminiProvider(config);

      case 'groq':
        this.logger.log(`GroqProvider 사용 (${config.model}, ${limits})`);
        return new GroqProvider(config);

      case 'claude':
        this.logger.log(`ClaudeProvider 사용 (${config.model}, ${limits})`);
        return new ClaudeProvider(config);

      default:
        this.logger.warn('MockProvider 사용 — 실제 AI 호출이 일어나지 않습니다.');
        return new MockProvider();
    }
  }
}
