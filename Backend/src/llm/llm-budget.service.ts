import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenUsage } from '@shared';
import type { LlmConfig } from '../config/configuration';

interface BudgetState {
  version: 1;
  dayKey: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmBudgetSnapshot extends BudgetState {
  dailyCallLimit: number;
  dailyTokenLimit: number;
}

const dayKey = (date = new Date()): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE?.trim() || 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
};

@Injectable()
export class LlmBudgetService {
  private readonly logger = new Logger(LlmBudgetService.name);
  private readonly config: LlmConfig;
  private state: BudgetState;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<LlmConfig>('llm');
    this.state = this.readState();
    this.syncDay();
  }

  reserveCall(): void {
    this.syncDay();
    const usedTokens = this.state.inputTokens + this.state.outputTokens;
    if (this.config.dailyCallLimit > 0 && this.state.calls >= this.config.dailyCallLimit) {
      throw new HttpException('오늘의 LLM 호출 한도에 도달했습니다.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (this.config.dailyTokenLimit > 0 && usedTokens >= this.config.dailyTokenLimit) {
      throw new HttpException('오늘의 LLM 토큰 한도에 도달했습니다.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.state.calls += 1;
    this.persist();
  }

  recordUsage(usage: TokenUsage): void {
    this.syncDay();
    this.state.inputTokens += Math.max(0, usage.inputTokens);
    this.state.outputTokens += Math.max(0, usage.outputTokens);
    this.persist();
  }

  snapshot(): LlmBudgetSnapshot {
    this.syncDay();
    return {
      ...this.state,
      dailyCallLimit: this.config.dailyCallLimit,
      dailyTokenLimit: this.config.dailyTokenLimit,
    };
  }

  private syncDay(): void {
    const today = dayKey();
    if (this.state.dayKey === today) return;
    this.state = this.emptyState(today);
    this.persist();
  }

  private readState(): BudgetState {
    try {
      const parsed = JSON.parse(readFileSync(this.config.budgetStatePath, 'utf8')) as Partial<BudgetState>;
      if (
        parsed.version === 1 &&
        typeof parsed.dayKey === 'string' &&
        Number.isFinite(parsed.calls) &&
        Number.isFinite(parsed.inputTokens) &&
        Number.isFinite(parsed.outputTokens)
      ) {
        return {
          version: 1,
          dayKey: parsed.dayKey,
          calls: Math.max(0, parsed.calls ?? 0),
          inputTokens: Math.max(0, parsed.inputTokens ?? 0),
          outputTokens: Math.max(0, parsed.outputTokens ?? 0),
        };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn(`LLM 예산 상태를 읽지 못했습니다: ${String(error)}`);
    }
    return this.emptyState(dayKey());
  }

  private emptyState(today: string): BudgetState {
    return { version: 1, dayKey: today, calls: 0, inputTokens: 0, outputTokens: 0 };
  }

  private persist(): void {
    mkdirSync(dirname(this.config.budgetStatePath), { recursive: true });
    const tempPath = `${this.config.budgetStatePath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    renameSync(tempPath, this.config.budgetStatePath);
  }
}
