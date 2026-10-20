import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmBudgetService } from './llm-budget.service';
import { LlmModelRegistry } from './llm-model.registry';

/**
 * 어떤 프로바이더를 쓸지는 LlmModelRegistry 가 정합니다.
 * 새 프로바이더(Groq, Ollama 등)를 추가하려면
 * LlmProvider 를 구현하고 레지스트리의 분기 하나만 늘리면 됩니다.
 */
@Module({
  providers: [LlmModelRegistry, LlmBudgetService, LlmService],
  exports: [LlmModelRegistry, LlmBudgetService, LlmService],
})
export class LlmModule {}
