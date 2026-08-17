import { useEffect, useState } from 'react';
import { PHASE_SEQUENCE, phaseIndexOf } from '@/constants/phases';
import { formatElapsed } from '@/lib/format-elapsed';
import { estimateCost, formatUsd } from '@/lib/llm-cost';
import { useSessionStore } from '@/store/session.store';
import styles from './ProjectStatusBar.module.css';

/**
 * 얇은 상단 프로젝트 상태 바 (OpenClaw Office 관제 헤더).
 *
 * 예전의 떠 있는 알약을 대체합니다 — 게임 HUD 처럼 늘 같은 자리에 붙어
 * **지시 · 단계 · 경과 · 호출 · 토큰 · 비용**을 한 줄로 보여줍니다.
 * 대기 중에도 사라지지 않아 캔버스 높이가 흔들리지 않습니다.
 */
export function ProjectStatusBar(): React.JSX.Element {
  const brief = useSessionStore((s) => s.brief);
  const phase = useSessionStore((s) => s.currentPhase);
  const running = useSessionStore((s) => s.isRunning);
  const result = useSessionStore((s) => s.result);
  const startedAt = useSessionStore((s) => s.startedAt);
  const llmCalls = useSessionStore((s) => s.llmCalls);
  const usage = useSessionStore((s) => s.usage);
  const provider = useSessionStore((s) => s.provider);
  const model = useSessionStore((s) => s.model);
  const agents = useSessionStore((s) => s.agents);
  const team = useSessionStore((s) => s.team);
  const workingCount = useSessionStore((s) =>
    [...s.avatars.values()].filter(
      (avatar) => avatar.status === 'thinking' || avatar.status === 'talking',
    ).length,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);

  const idle = !running && !result;

  const index = phase ? phaseIndexOf(phase) : -1;
  const isKnownPhase = index >= 0;
  const step = isKnownPhase ? index + 1 : PHASE_SEQUENCE.length;
  const phaseLabel = idle
    ? '대기 중'
    : isKnownPhase
      ? PHASE_SEQUENCE[index].label
      : '완료';

  const elapsedSeconds =
    running && startedAt
      ? Math.floor((now - startedAt) / 1_000)
      : (result?.elapsedSeconds ?? 0);

  const totals = result?.usage ?? usage;
  const calls = running ? llmCalls : result?.usage.calls ?? totals.calls;
  const tokens = totals.inputTokens + totals.outputTokens;

  const cost = estimateCost(
    provider || 'mock',
    model || 'mock',
    totals.inputTokens,
    totals.outputTokens,
  );
  const costLabel = cost.free
    ? '무료'
    : cost.known
      ? formatUsd(cost.usd)
      : '—';
  const progress = idle
    ? 0
    : isKnownPhase
      ? Math.round((step / PHASE_SEQUENCE.length) * 100)
      : 100;
  const state = idle ? 'idle' : running ? 'running' : 'done';

  return (
    <header
      className={styles.bar}
      data-state={state}
      style={{ '--progress': `${progress}%` } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <span className={styles.phase}>
        <i
          className={
            idle ? styles.dotIdle : running ? styles.dotWork : styles.dotDone
          }
          aria-hidden="true"
        />
        <b>{phaseLabel}</b>
        {!idle && (
          <span className={styles.step}>
            {step}/{PHASE_SEQUENCE.length}
          </span>
        )}
      </span>

      <span className={styles.title}>
        {idle ? 'MetaHub AI 회사' : brief || '진행 중'}
      </span>

      <span className={styles.metrics}>
        {idle ? (
          <span className={styles.metric}>{agents.length}명 온라인</span>
        ) : (
          <>
            <span className={`${styles.metric} ${styles.teamMetric}`}>
              {workingCount > 0
                ? `${workingCount}명 작업 중`
                : `${team.length}명 참여`}
            </span>
            <span className={`${styles.dividerDot} ${styles.teamMetric}`} aria-hidden="true" />
            <span className={styles.metric}>{formatElapsed(elapsedSeconds)}</span>
            <span className={styles.dividerDot} aria-hidden="true" />
            <span className={styles.metric}>LLM {calls}회</span>
            {tokens > 0 && (
              <>
                <span className={`${styles.dividerDot} ${styles.tokenMetric}`} aria-hidden="true" />
                <span className={`${styles.metric} ${styles.tokenMetric}`}>
                  {tokens.toLocaleString()} tok
                </span>
              </>
            )}
            <span className={styles.dividerDot} aria-hidden="true" />
            <span className={styles.cost}>{costLabel}</span>
          </>
        )}
      </span>

      <span className={styles.progressTrack} aria-hidden="true">
        <i />
      </span>
    </header>
  );
}
