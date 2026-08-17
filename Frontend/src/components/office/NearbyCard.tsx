import { STATUS_COLOR, STATUS_LABEL, deptAbbrev } from '@/lib/agent-status';
import { toPlainText } from '@/lib/markdown';
import { useSessionStore } from '@/store/session.store';
import type { NearbyInfo } from './office-renderer';
import styles from './NearbyCard.module.css';

interface NearbyCardProps {
  info: NearbyInfo;
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
  onSelectBrief: (brief: string) => void;
}

/**
 * 대표 아바타가 직원 곁에 가면 뜨는 카드.
 * 부서 색·이모지 대신 상태 3색과 부서 약어 배지만 씁니다.
 */
export function NearbyCard({
  info,
  expanded,
  onExpand,
  onClose,
  onSelectBrief,
}: NearbyCardProps): React.JSX.Element | null {
  const agent = useSessionStore((s) => s.agentMap.get(info.agentId));
  const avatar = useSessionStore((s) => s.avatars.get(info.agentId));
  const plan = useSessionStore((s) => s.plan);
  const team = useSessionStore((s) => s.team);
  const agentMap = useSessionStore((s) => s.agentMap);
  const selectAgent = useSessionStore((s) => s.selectAgent);
  const lastSpeech = useSessionStore((s) => {
    for (let i = s.logs.length - 1; i >= 0; i--) {
      const entry = s.logs[i];
      if (entry?.kind === 'speech' && entry.event.agent === info.agentId) {
        return entry.event;
      }
    }
    return null;
  });

  if (!agent) return null;

  const status = avatar?.status ?? 'idle';
  const talkingTo = avatar?.talkingTo
    ? agentMap.get(avatar.talkingTo) ?? null
    : null;
  const assignment = plan?.assignments.find((a) => a.agent === agent.team);
  const onTeam =
    team.includes(agent.id) ||
    team.includes(agent.team) ||
    Boolean(assignment);

  return (
    <aside
      className={`${styles.card} ${expanded ? styles.expanded : ''}`}
      aria-live="polite"
    >
      <header className={styles.head}>
        <span
          className={styles.badge}
          style={{ '--status-color': STATUS_COLOR[status] } as React.CSSProperties}
        >
          {deptAbbrev(agent.dept)}
        </span>
        <div>
          <div className={styles.name}>
            {agent.name} {agent.title}
          </div>
          <div className={styles.meta}>
            <span
              className={styles.statusDot}
              style={{ background: STATUS_COLOR[status] }}
              aria-hidden="true"
            />
            {info.zoneLabel} · {STATUS_LABEL[status]}
            {avatar?.note ? ` — ${avatar.note}` : ''}
          </div>
        </div>
        {expanded && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="상호작용 닫기">
            ×
          </button>
        )}
      </header>

      <p className={onTeam ? styles.chipOn : styles.chipOff}>
        {onTeam ? '이번 업무 참여' : '이번 업무 미참여'}
        {talkingTo ? ` · ${talkingTo.dept}와 대화 중` : ''}
      </p>

      {/*
        카드에는 네 단계만 둡니다 — 누구인지 / 지금 상태 / 지금 하는 일 / 할 수 있는 것.
        참여 이유·발언 이력·전체 초안은 상세 패널의 몫입니다. 여기에 다 넣으면
        직원 옆을 지나갈 때마다 화면 절반이 카드로 덮입니다.
      */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>현재 업무</span>
        <p>{assignment ? assignment.task : agent.specialty}</p>
      </section>

      {lastSpeech && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>최근 보고</span>
          <p className={styles.quote}>
            {toPlainText(lastSpeech.text).slice(0, 110)}
            {lastSpeech.text.length > 110 ? '…' : ''}
          </p>
        </section>
      )}

      {!expanded ? (
        <button type="button" className={styles.interactHint} onClick={onExpand}>
          <kbd>F</kbd>
          <span>상호작용</span>
        </button>
      ) : (
        <div className={styles.actions} aria-label={`${agent.name} 상호작용`}>
          <button type="button" onClick={() => selectAgent(agent.id)}>
            상세 보기
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectBrief(
                `${agent.name} ${agent.title}에게 현재 판단과 진행 상황을 직접 보고해달라고 해줘.`,
              )
            }
          >
            보고 요청
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectBrief(
                `${agent.name} ${agent.title}와 업무 지시가 아닌 가벼운 일상 대화를 나눠줘. 지금 상태를 자연스럽게 물어봐줘.`,
              )
            }
          >
            대화하기
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectBrief(`${agent.dept} ${agent.name}에게 다음 업무를 맡기고 싶어: `)
            }
          >
            업무 요청
          </button>
        </div>
      )}
    </aside>
  );
}
