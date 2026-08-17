/**
 * 모델별 대략 단가 (USD / 1M 토큰).
 *
 * 프로바이더 공식 요금표의 근사치입니다. 무료·로컬은 0 으로 두고,
 * 패널에는 "예상" 이라고 명시합니다 — 정확한 청구액이 아닙니다.
 */
const RATES: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4': { input: 15, output: 75 },
  mock: { input: 0, output: 0 },
};

const FREE_PROVIDERS = new Set(['ollama', 'mock']);

export interface CostEstimate {
  /** USD — 0 이면 무료/로컬이거나 단가를 모름 */
  usd: number;
  /** 단가표를 찾은 경우 */
  known: boolean;
  /** 무료 프로바이더 */
  free: boolean;
}

/** 입력·출력 토큰으로 예상 비용을 계산합니다. */
export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostEstimate {
  if (FREE_PROVIDERS.has(provider)) {
    return { usd: 0, known: true, free: true };
  }

  const rate = RATES[model];
  if (!rate) {
    return { usd: 0, known: false, free: false };
  }

  const usd =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output;

  return { usd, known: true, free: false };
}

/** $0.0012 → "$0.0012", $0 → "$0" */
export function formatUsd(usd: number): string {
  if (usd <= 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
