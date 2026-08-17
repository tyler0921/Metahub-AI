import { useEffect, useMemo, useState } from 'react';
import { PHASE_SEQUENCE, phaseIndexOf } from '@/constants/phases';
import { formatElapsed } from '@/lib/format-elapsed';
import { estimateCost, formatUsd } from '@/lib/llm-cost';
import { useSessionStore } from '@/store/session.store';
import styles from './UsagePanel.module.css';

/**
 * 사용량·비용 패널.
 *
 * usage SSE 가 쌓는 실시간 토큰·호출 수와, 모델 단가표 기반 예상 비용을
 * 보여줍니다. 정확한 청구액이 아니라 대략의 감각을 주는 게 목적입니다.
 */
export function UsagePanel(): React.JSX.Element | null {
  const isRunning = useSessionStore((s) => s.isRunning);
  const result = useSessionStore((s) => s.result);
  const startedAt = useSessionStore((s) => s.startedAt);
  const usage = useSessionStore((s) => s.usage);
  const usageSlices = useSessionStore((s) => s.usageSlices);
  const provider = useSessionStore((s) => s.provider);
  const model = useSessionStore((s) => s.model);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const totals = result?.usage ?? usage;
  const hasActivity = totals.calls > 0 || isRunning || Boolean(result);
  if (!hasActivity) return null;

  const elapsedSeconds =
    isRunning && startedAt
      ? Math.floor((now - startedAt) / 1_000)
      : (result?.elapsedSeconds ?? 0);

  const cost = estimateCost(
    provider || 'mock',
    model || 'mock',
    totals.inputTokens,
    totals.outputTokens,
  );

  const phaseRows = useMemo(() => {
    const map = new Map<
      string,
      { label: string; calls: number; tokens: number; order: number }
    >();

    for (const slice of usageSlices) {
      const key = slice.phase ?? 'other';
      const order = slice.phase ? phaseIndexOf(slice.phase) : 99;
      const label =
        PHASE_SEQUENCE.find((p) => p.key === slice.phase)?.label ?? '기타';
      const prev = map.get(key) ?? { label, calls: 0, tokens: 0, order };
      prev.calls += slice.calls;
      prev.tokens += slice.inputTokens + slice.outputTokens;
      map.set(key, prev);
    }

    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [usageSlices]);

  const costLabel = cost.free
    ? '무료'
    : cost.known
      ? `예상 ${formatUsd(cost.usd)}`
      : '단가 미확인';

  return (
    <section className={styles.root} aria-label="사용량·비용">
      <header className={styles.head}>
        <strong>사용량</strong>
        <span className={styles.env}>
          {provider || '—'}
          {model ? ` · ${model}` : ''}
        </span>
      </header>

      <dl className={styles.stats}>
        <div>
          <dt>호출</dt>
          <dd>{totals.calls}회</dd>
        </div>
        <div>
          <dt>경과</dt>
          <dd>{formatElapsed(elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>입력</dt>
          <dd>{totals.inputTokens.toLocaleString()}</dd>
        </div>
        <div>
          <dt>출력</dt>
          <dd>{totals.outputTokens.toLocaleString()}</dd>
        </div>
      </dl>

      <p className={styles.cost}>
        <span>비용</span>
        <b>{costLabel}</b>
      </p>

      {phaseRows.length > 0 && (
        <ul className={styles.phases}>
          {phaseRows.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <em>
                {row.calls}회 · {row.tokens.toLocaleString()} tok
              </em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
