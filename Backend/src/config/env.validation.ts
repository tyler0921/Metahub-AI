import { z } from 'zod';

/** `.env` 에 `KEY=` 처럼 빈 값이 들어오면 undefined 로 취급합니다 */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * 환경변수 스키마 — 잘못 설정하면 서버가 아예 뜨지 않게 합니다.
 * (조용히 잘못 동작하는 것보다 부팅 실패가 낫습니다)
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('*'),
  APP_TIMEZONE: z.preprocess(emptyToUndefined, z.string().optional()),

  // 지정하지 않으면 키가 있는 프로바이더를 자동 선택합니다
  AI_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['ollama', 'gemini', 'groq', 'claude', 'mock']).optional(),
  ),
  OLLAMA_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OLLAMA_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  OLLAMA_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(10_000).max(1_800_000).optional(),
  ),
  // 너무 작으면 프롬프트가 잘리고, 너무 크면 VRAM 이 터집니다
  OLLAMA_NUM_CTX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(2_048).max(131_072).optional(),
  ),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GROQ_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),

  // 비워두면 프로바이더별 기본값(무료 등급 기준)이 적용됩니다
  LLM_MAX_CONCURRENT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(32).optional(),
  ),
  LLM_REQUESTS_PER_MINUTE: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(1000).optional(),
  ),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  LLM_DAILY_CALL_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(100_000).optional(),
  ),
  LLM_DAILY_TOKEN_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  ),
  LLM_BUDGET_STATE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  ADMIN_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  OBSIDIAN_VAULT: z.preprocess(emptyToUndefined, z.string().optional()),
  OBSIDIAN_ROOT: z.string().default('AI Company'),

  WORKSPACE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),

  // 'false' 를 명시할 때만 회고를 끕니다
  WORKFLOW_REFLECT: z.preprocess(emptyToUndefined, z.string().optional()),

  FEEDBACK_ROUNDS: z.coerce.number().int().min(0).max(3).default(1),
  MAX_REWORK: z.coerce.number().int().min(0).max(3).default(1),
  SESSION_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  SESSION_DATABASE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTONOMOUS_WORK_ENABLED: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTONOMOUS_WORK_STARTUP_DELAY_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).optional(),
  ),
  AUTONOMOUS_WORK_INTERVAL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(60_000).optional(),
  ),
  AUTONOMOUS_WORK_DAILY_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(24).optional(),
  ),
  AUTONOMOUS_WORK_MAX_SESSION_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(60_000).optional(),
  ),
  AUTONOMOUS_WORK_STATE_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
  AUTONOMOUS_WORK_INBOX_PATH: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`환경변수 설정이 올바르지 않습니다.\n${detail}`);
  }

  const env = result.data;
  const hasAnyKey = Boolean(
    env.GEMINI_API_KEY?.trim() ?? env.GROQ_API_KEY?.trim() ?? env.ANTHROPIC_API_KEY?.trim(),
  );

  // 치명적이지는 않음 — mock 으로 자동 전환되므로 경고만
  if (env.AI_PROVIDER !== 'mock' && env.AI_PROVIDER !== 'ollama' && !hasAnyKey) {
    console.warn(
      '[env] API 키가 없습니다. mock 프로바이더로 기동합니다.\n' +
        '      로컬로 쓰려면: AI_PROVIDER=ollama (키 불필요, https://ollama.com/download)',
        '      또는 무료 키: https://aistudio.google.com/apikey (GEMINI_API_KEY)',
        '            https://console.groq.com/keys      (GROQ_API_KEY)',
    );
  }
  if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY?.trim()) {
    console.warn('[env] AI_PROVIDER=gemini 인데 GEMINI_API_KEY 가 비어 있습니다.');
  }
  if (env.AI_PROVIDER === 'groq' && !env.GROQ_API_KEY?.trim()) {
    console.warn('[env] AI_PROVIDER=groq 인데 GROQ_API_KEY 가 비어 있습니다.');
  }
  if (env.AI_PROVIDER === 'claude' && !env.ANTHROPIC_API_KEY?.trim()) {
    console.warn('[env] AI_PROVIDER=claude 인데 ANTHROPIC_API_KEY 가 비어 있습니다.');
  }

  return env;
}
