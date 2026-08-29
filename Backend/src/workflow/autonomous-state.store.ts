import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AutonomousWorkConfig } from '../config/configuration';

export interface AutonomousWorkState {
  version: 1;
  dayKey: string;
  runsToday: number;
  paused: boolean;
  consecutiveFailures: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastSessionId: string | null;
  recentBriefs: string[];
}

const freshState = (): AutonomousWorkState => ({
  version: 1,
  dayKey: localDayKey(),
  runsToday: 0,
  paused: false,
  consecutiveFailures: 0,
  nextRunAt: null,
  lastRunAt: null,
  lastSessionId: null,
  recentBriefs: [],
});

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class AutonomousStateStore {
  private readonly logger = new Logger(AutonomousStateStore.name);
  private readonly path: string;
  private state: AutonomousWorkState;

  constructor(config: ConfigService) {
    this.path = config.getOrThrow<AutonomousWorkConfig>('autonomousWork').statePath;
    this.state = this.load();
    this.syncDay();
  }

  snapshot(): AutonomousWorkState {
    return { ...this.state, recentBriefs: [...this.state.recentBriefs] };
  }

  reload(): AutonomousWorkState {
    this.state = this.load();
    this.syncDay();
    return this.snapshot();
  }

  syncDay(now = new Date()): void {
    const dayKey = localDayKey(now);
    if (this.state.dayKey === dayKey) return;
    this.state = {
      ...this.state,
      dayKey,
      runsToday: 0,
      consecutiveFailures: 0,
    };
    this.save();
  }

  recordRun(brief: string, sessionId: string, at = new Date()): void {
    this.syncDay(at);
    this.state.runsToday += 1;
    this.state.lastRunAt = at.toISOString();
    this.state.lastSessionId = sessionId;
    this.state.recentBriefs = [brief, ...this.state.recentBriefs.filter((item) => item !== brief)]
      .slice(0, 6);
    this.save();
  }

  recordSuccess(): void {
    this.state.consecutiveFailures = 0;
    this.save();
  }

  recordFailure(): void {
    this.state.consecutiveFailures += 1;
    this.save();
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused;
    if (paused) this.state.nextRunAt = null;
    this.save();
  }

  setNextRunAt(nextRunAt: Date | null): void {
    this.state.nextRunAt = nextRunAt?.toISOString() ?? null;
    this.save();
  }

  private load(): AutonomousWorkState {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<AutonomousWorkState>;
      if (parsed.version !== 1 || typeof parsed.dayKey !== 'string') return freshState();
      return {
        ...freshState(),
        ...parsed,
        recentBriefs: Array.isArray(parsed.recentBriefs)
          ? parsed.recentBriefs.filter((brief): brief is string => typeof brief === 'string').slice(0, 6)
          : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`자율 업무 상태 파일을 읽지 못해 초기화합니다: ${String(error)}`);
      }
      return freshState();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    renameSync(tempPath, this.path);
  }
}
