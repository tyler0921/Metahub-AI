import { PHASE_SEQUENCE } from '@/constants/phases';
import { useSessionStore } from '@/store/session.store';
import type { ZoneInfo } from './office-renderer';
import styles from './OfficeOverview.module.css';

interface OfficeOverviewProps {
  currentZone: ZoneInfo | null;
  compact?: boolean;
}

export function OfficeOverview({ currentZone, compact = false }: OfficeOverviewProps): React.JSX.Element {
  const agents = useSessionStore((s) => s.agents);
  const avatars = useSessionStore((s) => s.avatars);
  const isRunning = useSessionStore((s) => s.isRunning);
  const currentPhase = useSessionStore((s) => s.currentPhase);
  const phaseLabel = PHASE_SEQUENCE.find((phase) => phase.key === currentPhase)?.label;
  const working = [...avatars.values()].filter(
    (avatar) => avatar.status === 'thinking' || avatar.status === 'talking',
  ).length;

  return (
    <aside className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label="현재 공간">
      <div className={styles.roomIcon} aria-hidden="true">
        <i /><i /><i /><i /><span />
      </div>
      <div className={styles.roomInfo}>
        <span>METAHUB · HQ 1F</span>
        <strong>{currentZone?.label ?? '본사 로비'}</strong>
        <small>{isRunning ? `${phaseLabel ?? '업무'} · ${working}명 작업 중` : '업무 가능 · 자유롭게 둘러보세요'}</small>
      </div>
      <div className={styles.presence} title={`${agents.length}명 온라인`}>
        {agents.slice(0, 3).map((agent) => (
          <i key={agent.id} style={{ background: agent.color }}>{agent.emoji}</i>
        ))}
        <b>+{Math.max(0, agents.length - 3)}</b>
      </div>
    </aside>
  );
}
