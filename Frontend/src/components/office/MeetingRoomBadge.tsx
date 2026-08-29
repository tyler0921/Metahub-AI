import { PHASE_SEQUENCE, phaseIndexOf } from '@/constants/phases';
import { deptAbbrev } from '@/lib/agent-status';
import { useSessionStore } from '@/store/session.store';
import styles from './MeetingRoomBadge.module.css';

const MEETING_PHASES = new Set(['feedback', 'revise']);

/** 교차검토·개정 단계에 회의실 집합 상태를 공간 위에 표시합니다. */
export function MeetingRoomBadge(): React.JSX.Element | null {
  const phase = useSessionStore((s) => s.currentPhase);
  const team = useSessionStore((s) => s.team);
  const agentMap = useSessionStore((s) => s.agentMap);
  const isRunning = useSessionStore((s) => s.isRunning);

  if (!isRunning || !phase || !MEETING_PHASES.has(phase)) return null;

  const label = PHASE_SEQUENCE.find((item) => item.key === phase)?.label ?? '회의';
  const index = phaseIndexOf(phase);
  const members = team
    .map((id) => agentMap.get(id))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
    .slice(0, 5);

  return (
    <div className={styles.badge} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>{label} 진행 중</strong>
        <small>
          {team.length > 0
            ? `${team.length}개 부서 · ${index + 1}/${PHASE_SEQUENCE.length}단계`
            : '관련 부서가 회의실에 모였습니다'}
        </small>
      </div>
      {members.length > 0 && (
        <div className={styles.stack} aria-hidden="true">
          {members.map((agent) => (
            <i key={agent.id}>{deptAbbrev(agent.dept)}</i>
          ))}
          {team.length > members.length && <b>+{team.length - members.length}</b>}
        </div>
      )}
    </div>
  );
}
