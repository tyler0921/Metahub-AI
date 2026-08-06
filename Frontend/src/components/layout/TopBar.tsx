import type { AppConfigResponse } from '@shared';
import { useTodayLabel } from '@/hooks/useTodayLabel';
import { useSessionStore } from '@/store/session.store';
import styles from './TopBar.module.css';

interface TopBarProps {
  config: AppConfigResponse | null;
  agentCount: number;
  isOffline: boolean;
}

export function TopBar({
  config,
  agentCount,
  isOffline,
}: TopBarProps): React.JSX.Element {
  const isRunning = useSessionStore((s) => s.isRunning);
  const todayLabel = useTodayLabel();

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">M</span>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>MetaHub AI</h1>
            <span className={styles.spaceBadge}>DIGITAL HQ</span>
          </div>
          <p className={styles.meta}>
            {isOffline ? (
              <span className={styles.offline}>백엔드에 연결할 수 없습니다</span>
            ) : config ? (
              <>
                서울 본사 · AI 직원 {agentCount}명 ·{' '}
                <b>{config.provider === 'mock' ? '체험 모드' : config.model}</b>
              </>
            ) : (
              '공간에 연결 중…'
            )}
          </p>
        </div>
      </div>

      <nav className={styles.actions} aria-label="공간 상태 및 메뉴">
        <span className={`${styles.pill} ${styles.datePill}`}>{todayLabel}</span>
        <span className={`${styles.pill} ${isOffline ? styles.pillWarn : styles.pillOk}`}>
          <span className={styles.statusDot} />
          {isOffline ? '오프라인' : isRunning ? '업무 진행 중' : '온라인'}
        </span>
        <span className={styles.pill}>
          <span className={styles.avatarStack} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {agentCount}명
        </span>
      </nav>
    </header>
  );
}
