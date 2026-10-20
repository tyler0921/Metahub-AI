import { useEffect, useState } from 'react';
import { AgentFace } from '@/components/common/AgentFace';
import { BrandLogo } from '@/components/common/BrandLogo';
import { Icon, type IconName } from '@/components/common/Icon';
import { AutonomousInbox } from './AutonomousInbox';
import { PHASE_SEQUENCE, phaseIndexOf } from '@/constants/phases';
import { formatElapsed } from '@/lib/format-elapsed';
import { estimateCost, formatUsd } from '@/lib/llm-cost';
import { useAutonomousWork } from '@/hooks/useAutonomousWork';
import { deptAbbrev } from '@/lib/agent-status';
import { useSessionStore } from '@/store/session.store';
import { WORKSPACE_TABS, useUiStore, type WorkspaceTabKey } from '@/store/ui.store';
import styles from './ProjectStatusBar.module.css';

const TAB_ICONS: Record<WorkspaceTabKey, IconName> = {
  tasks: 'tasks',
  log: 'chat',
  result: 'package',
  vault: 'book',
};

/**
 * 상단 내비게이션 바.
 *
 * 왼쪽은 회사 이름과 화면 탭(오피스 · 업무 · 진행 · 산출물 · 문서),
 * 오른쪽은 자율 운영 · 진행 단계 · 경과 · 비용 · 온라인 인원입니다.
 * 탭은 별도 페이지가 아니라 활동 패널을 엽니다 — 하단 메뉴와 같은 요청을 씁니다.
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
  const autonomous = useAutonomousWork();
  const inboxOpen = useUiStore((s) => s.inboxOpen);
  const setInboxOpen = useUiStore((s) => s.setInboxOpen);
  const setInboxCount = useUiStore((s) => s.setInboxCount);
  const openPanel = useUiStore((s) => s.openPanel);
  const requestPanel = useUiStore((s) => s.requestPanel);

  // 우측 레일의 알림 배지가 읽습니다
  const inboxCount = autonomous.status
    ? autonomous.status.queuedCount + autonomous.status.pendingApprovalCount
    : 0;
  useEffect(() => {
    setInboxCount(inboxCount);
  }, [inboxCount, setInboxCount]);

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
    ? '지시 대기'
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
    >
      <span className={styles.brand}>
        <BrandLogo className={styles.logo} />
        <b>MetaHub AI 회사</b>
      </span>

      <nav className={styles.tabs} aria-label="화면">
        <button
          type="button"
          className={openPanel === null ? styles.activeTab : ''}
          aria-current={openPanel === null ? 'page' : undefined}
          onClick={() => requestPanel('office')}
        >
          <Icon name="home" size={17} />
          <span className={styles.tabLabel}>오피스</span>
        </button>
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={openPanel === tab.key ? styles.activeTab : ''}
            aria-current={openPanel === tab.key ? 'page' : undefined}
            onClick={() => requestPanel(tab.key)}
          >
            <Icon name={TAB_ICONS[tab.key]} size={17} />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>

      <span className={styles.spacer} />

      {autonomous.status?.configured && (
        <span className={styles.autonomousControls} title={autonomous.error ?? undefined}>
          <button
            type="button"
            className={styles.autonomousToggle}
            data-enabled={autonomous.status.enabled}
            onClick={() => void autonomous.toggle()}
            disabled={autonomous.isBusy}
            aria-pressed={autonomous.status.enabled}
            title={`켜 두면 AI 직원들이 업무함의 대기 업무를 스스로 처리합니다 (오늘 ${autonomous.status.runsToday}/${autonomous.status.dailyLimit}회)`}
          >
            <Icon name="bolt" size={15} />
            <span className={styles.autoLabel}>
              {autonomous.status.enabled ? 'AI 자동화 ON' : 'AI 자동화 OFF'}
            </span>
            <small>
              {autonomous.status.runsToday}/{autonomous.status.dailyLimit}
            </small>
          </button>
          {!running && autonomous.status.enabled && !autonomous.status.activeSession && (
            <button
              type="button"
              className={styles.runNow}
              onClick={() => void autonomous.runNow()}
              disabled={
                autonomous.isBusy ||
                autonomous.status.runsToday >= autonomous.status.dailyLimit
              }
            >
              지금 실행
            </button>
          )}
        </span>
      )}

      {/* 진행 단계 — 바뀔 때마다 스크린리더가 읽습니다 */}
      <span
        className={styles.phase}
        role="status"
        aria-live="polite"
        title={!idle && brief ? brief : undefined}
      >
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

      {!idle && (
        <span className={styles.metrics}>
          <span className={`${styles.metric} ${styles.teamMetric}`}>
            {workingCount > 0
              ? `${workingCount}명 작업 중`
              : `${team.length}명 참여`}
          </span>
          <span className={styles.metric}>{formatElapsed(elapsedSeconds)}</span>
          <span className={`${styles.metric} ${styles.tokenMetric}`}>AI 호출 {calls}회</span>
          {tokens > 0 && (
            <span className={`${styles.metric} ${styles.tokenMetric}`}>
              {tokens.toLocaleString()} tok
            </span>
          )}
          <span className={styles.cost}>{costLabel}</span>
        </span>
      )}

      <span className={styles.online}>
        <Icon name="users" size={16} />
        {agents.length}명 온라인
      </span>

      <span className={styles.avatars} aria-hidden="true">
        {agents.slice(0, 3).map((agent) => (
          <i key={agent.id}>
            <AgentFace agentId={agent.id} size={28} fallback={deptAbbrev(agent.dept)} />
          </i>
        ))}
        {agents.length > 3 && <b>+{agents.length - 3}</b>}
      </span>

      <span className={styles.progressTrack} aria-hidden="true">
        <i />
      </span>
      <AutonomousInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
    </header>
  );
}
