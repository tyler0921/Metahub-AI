import { useCallback, useEffect, useState } from 'react';
import type { LlmModelOption, LlmModelsResponse } from '@shared';
import { companyService } from '@/services/company.service';
import { ApiError } from '@/services/http.client';
import { useSessionStore } from '@/store/session.store';
import styles from './ModelPicker.module.css';

/** 드롭다운 묶음 이름 — 처음 보는 사람도 어디서 도는 모델인지 알 수 있게 */
const PROVIDER_LABELS: Record<string, string> = {
  ollama: '내 PC (Ollama · 무료)',
  gemini: 'Google Gemini',
  groq: 'Groq',
  claude: 'Claude (API 요금 발생)',
  mock: '체험 모드',
};

const keyOf = (option: LlmModelOption): string => `${option.provider}::${option.model}`;

const labelOf = (option: LlmModelOption): string =>
  option.provider === 'mock' ? '체험 모드 (예시 답변)' : option.model;

/**
 * 왼쪽 레일의 AI 모델 고르기.
 *
 * 업무가 진행 중이면 잠급니다 — 도중에 바꾸면 부서마다 다른 모델이 쓴 원고가 섞입니다.
 * 목록은 펼칠 때마다 다시 받아서 방금 받은 Ollama 모델도 바로 보이게 합니다.
 */
export function ModelPicker(): React.JSX.Element | null {
  const isRunning = useSessionStore((s) => s.isRunning);
  const [data, setData] = useState<LlmModelsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await companyService.getLlmModels());
    } catch {
      // 목록을 못 받아도 지금 모델 표시는 그대로 둡니다
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, isRunning]);

  if (!data) return null;

  const select = async (key: string): Promise<void> => {
    const next = data.options.find((option) => keyOf(option) === key);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setData(await companyService.selectLlmModel(next));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '모델을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const locked = isRunning || data.locked;
  const groups = [...new Set(data.options.map((option) => option.provider))];

  return (
    <label
      className={styles.picker}
      title={locked ? '진행 중인 업무가 끝나면 바꿀 수 있습니다' : '다음 업무부터 이 모델이 일합니다'}
    >
      <span className={styles.label}>AI 모델</span>
      <select
        className={styles.select}
        value={keyOf(data.current)}
        disabled={locked || busy}
        onFocus={() => void refresh()}
        onChange={(event) => void select(event.target.value)}
      >
        {groups.map((provider) => (
          <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
            {data.options
              .filter((option) => option.provider === provider)
              .map((option) => (
                <option key={keyOf(option)} value={keyOf(option)}>
                  {labelOf(option)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
