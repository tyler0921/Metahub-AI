import { registerAs } from '@nestjs/config';
import * as path from 'node:path';

/** 저장소 최상위 (Backend/ 의 부모) */
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export type LlmProviderName = 'ollama' | 'gemini' | 'groq' | 'claude' | 'mock';

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  version: string;
}

export interface LlmConfig {
  provider: LlmProviderName;
  apiKey: string;
  model: string;
  /** 동시에 진행할 LLM 호출 수 */
  maxConcurrent: number;
  /** 분당 호출 상한 (0 = 무제한) */
  requestsPerMinute: number;
  /** 한도·일시 오류에 대한 재시도 횟수 */
  maxRetries: number;
  /** 로컬 서버 주소 (Ollama 전용) */
  baseUrl: string;
  /**
   * 컨텍스트 창 크기 (Ollama 전용, num_ctx).
   *
   * Ollama 는 지정하지 않으면 4096 으로 잘라버립니다. 이 앱은 교차검토 단계에서
   * 동료 부서 원고를 전부 붙이므로 기본값으로는 프롬프트 앞부분이 조용히
   * 날아갑니다. 대신 크게 잡을수록 VRAM 을 더 씁니다.
   */
  contextWindow: number;
  /** 한 번의 호출을 기다려주는 시간 (ms) — 로컬 모델은 느릴 수 있습니다 */
  timeoutMs: number;
}

export interface VaultConfig {
  path: string;
  rootFolder: string;
}

export interface WorkflowConfig {
  feedbackRounds: number;
  maxRework: number;
  sessionTtlMs: number;
  /**
   * 세션 끝에 부서별 회고를 돌릴지.
   *
   * 부서 수만큼 LLM 호출이 추가됩니다. 로컬 모델에서 세션이 이미 길다면
   * 꺼도 됩니다 — 대신 볼트에 지식이 쌓이지 않습니다.
   */
  reflect: boolean;
}

export interface AutonomousWorkConfig {
  enabled: boolean;
  startupDelayMs: number;
  intervalMs: number;
  dailyLimit: number;
  maxSessionMs: number;
  statePath: string;
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
};

/** 프로바이더별 기본값 — 무료 등급에서 429 를 맞지 않는 선으로 잡았습니다 */
const PROVIDER_DEFAULTS: Record<
  LlmProviderName,
  { model: string; maxConcurrent: number; requestsPerMinute: number }
> = {
  // 로컬 모델. 한도도 비용도 없지만 Ollama 가 요청을 직렬 처리하므로
  // 동시 호출은 1로 묶어야 오히려 빠릅니다.
  ollama: { model: 'qwen3:8b', maxConcurrent: 1, requestsPerMinute: 0 },
  // Gemini 무료 등급은 분당 한도가 빠듯합니다. 보수적으로 시작하세요.
  gemini: { model: 'gemini-2.0-flash', maxConcurrent: 2, requestsPerMinute: 10 },
  // Groq 무료 등급의 병목은 요청 수가 아니라 분당 토큰(12K TPM)입니다.
  // 이 앱은 프롬프트가 길어 분당 4회가 현실적인 상한입니다.
  groq: { model: 'llama-3.3-70b-versatile', maxConcurrent: 1, requestsPerMinute: 4 },
  claude: { model: 'claude-sonnet-5', maxConcurrent: 4, requestsPerMinute: 50 },
  mock: { model: 'mock', maxConcurrent: 8, requestsPerMinute: 0 },
};

/**
 * 어떤 프로바이더로 뜰지 결정합니다.
 * 1) AI_PROVIDER 를 명시했으면 그대로 (단, 키가 없으면 mock 으로 내려앉음)
 * 2) 명시하지 않았으면 키가 있는 쪽을 자동 선택 (Gemini 우선)
 * 3) 아무 키도 없으면 mock
 */
function resolveProvider(): { provider: LlmProviderName; apiKey: string } {
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  const groqKey = process.env.GROQ_API_KEY?.trim() ?? '';
  const claudeKey = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase();

  // Ollama 는 API 키가 없습니다. 명시하면 그대로 씁니다.
  if (requested === 'ollama') return { provider: 'ollama', apiKey: '' };

  if (requested === 'mock') return { provider: 'mock', apiKey: '' };
  if (requested === 'gemini') {
    return geminiKey
      ? { provider: 'gemini', apiKey: geminiKey }
      : { provider: 'mock', apiKey: '' };
  }
  if (requested === 'groq') {
    return groqKey
      ? { provider: 'groq', apiKey: groqKey }
      : { provider: 'mock', apiKey: '' };
  }
  if (requested === 'claude') {
    return claudeKey
      ? { provider: 'claude', apiKey: claudeKey }
      : { provider: 'mock', apiKey: '' };
  }

  if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };
  if (groqKey) return { provider: 'groq', apiKey: groqKey };
  if (claudeKey) return { provider: 'claude', apiKey: claudeKey };
  return { provider: 'mock', apiKey: '' };
}

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    port: toInt(process.env.PORT, 3000),
    corsOrigins: (process.env.CORS_ORIGIN ?? '*')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    version: process.env.npm_package_version ?? '2.0.0',
  }),
);

export const llmConfig = registerAs('llm', (): LlmConfig => {
  const { provider, apiKey } = resolveProvider();
  const defaults = PROVIDER_DEFAULTS[provider];

  const explicitModel =
    provider === 'ollama'
      ? process.env.OLLAMA_MODEL?.trim()
      : provider === 'gemini'
      ? process.env.GEMINI_MODEL?.trim()
      : provider === 'groq'
        ? process.env.GROQ_MODEL?.trim()
        : provider === 'claude'
          ? process.env.ANTHROPIC_MODEL?.trim()
          : undefined;

  return {
    provider,
    apiKey,
    model: explicitModel || defaults.model,
    maxConcurrent: toInt(process.env.LLM_MAX_CONCURRENT, defaults.maxConcurrent),
    requestsPerMinute: toInt(
      process.env.LLM_REQUESTS_PER_MINUTE,
      defaults.requestsPerMinute,
    ),
    maxRetries: toInt(process.env.LLM_MAX_RETRIES, 3),
    baseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
    contextWindow: toInt(process.env.OLLAMA_NUM_CTX, 16_384),
    // 로컬 모델은 첫 호출에 모델을 올리느라 오래 걸립니다
    timeoutMs: toInt(process.env.OLLAMA_TIMEOUT_MS, 300_000),
  };
});

/**
 * 코드형 산출물이 저장되는 곳.
 *
 * 볼트(Obsidian)는 "읽는 문서"를 위한 곳이라 html/css/js 를 섞지 않습니다.
 * 실행 가능한 파일은 저장소 루트의 `workspace/` 에 따로 쌓고, 서버가
 * 그 폴더를 정적으로 서빙해 프론트가 iframe 으로 바로 열어볼 수 있게 합니다.
 */
export interface WorkspaceConfig {
  path: string;
  /** 정적 서빙 경로 접두사 — 프론트가 만드는 미리보기 주소의 앞부분 */
  urlPrefix: string;
}

export const workspaceConfig = registerAs(
  'workspace',
  (): WorkspaceConfig => ({
    path:
      process.env.WORKSPACE_PATH?.trim() || path.join(PROJECT_ROOT, 'workspace'),
    urlPrefix: '/workspace',
  }),
);

export const vaultConfig = registerAs(
  'vault',
  (): VaultConfig => ({
    path: process.env.OBSIDIAN_VAULT?.trim() || path.join(PROJECT_ROOT, 'vault'),
    rootFolder: process.env.OBSIDIAN_ROOT?.trim() || 'AI Company',
  }),
);

export const workflowConfig = registerAs(
  'workflow',
  (): WorkflowConfig => ({
    feedbackRounds: Math.max(0, toInt(process.env.FEEDBACK_ROUNDS, 1)),
    maxRework: Math.max(0, toInt(process.env.MAX_REWORK, 1)),
    sessionTtlMs: toInt(process.env.SESSION_TTL_MS, 60 * 60 * 1000),
    reflect: process.env.WORKFLOW_REFLECT?.trim().toLowerCase() !== 'false',
  }),
);

export const autonomousWorkConfig = registerAs(
  'autonomousWork',
  (): AutonomousWorkConfig => ({
    enabled: toBool(process.env.AUTONOMOUS_WORK_ENABLED, true),
    startupDelayMs: Math.max(1_000, toInt(process.env.AUTONOMOUS_WORK_STARTUP_DELAY_MS, 8_000)),
    intervalMs: Math.max(60_000, toInt(process.env.AUTONOMOUS_WORK_INTERVAL_MS, 30 * 60 * 1000)),
    dailyLimit: Math.max(1, toInt(process.env.AUTONOMOUS_WORK_DAILY_LIMIT, 3)),
    maxSessionMs: Math.max(
      60_000,
      toInt(process.env.AUTONOMOUS_WORK_MAX_SESSION_MS, 20 * 60 * 1000),
    ),
    statePath:
      process.env.AUTONOMOUS_WORK_STATE_PATH?.trim() ||
      path.join(PROJECT_ROOT, 'data', 'autonomous-work.json'),
  }),
);

export const configurations = [
  appConfig,
  llmConfig,
  vaultConfig,
  workspaceConfig,
  workflowConfig,
  autonomousWorkConfig,
];
