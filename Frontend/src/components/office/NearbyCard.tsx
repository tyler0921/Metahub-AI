import { useSessionStore } from '@/store/session.store';
import { toPlainText } from '@/lib/markdown';
import type { NearbyInfo } from './office-renderer';
import styles from './NearbyCard.module.css';

interface NearbyCardProps {
  info: NearbyInfo;
  expanded: boolean;
  onExpand: () => void;
  onSelectBrief: (brief: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: '대기 중',
  thinking: '작업 중',
  talking: '대화 중',
  done: '완료',
};

/**
 * 대표 아바타가 직원 곁에 가면 뜨는 카드.
 * 그 직원이 지금 무슨 일을 하고 있는지, 마지막 발언이 무엇인지 보여줍니다.
 */
export function NearbyCard({
  info,
  expanded,
  onExpand,
  onSelectBrief,
}: NearbyCardProps): React.JSX.Element | null {
  const agent = useSessionStore((s) => s.agentMap.get(info.agentId));
  const avatar = useSessionStore((s) => s.avatars.get(info.agentId));
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

  return (
    <aside
      className={`${styles.card} ${expanded ? styles.expanded : ''}`}
      style={{ borderColor: agent.color }}
    >
      <header className={styles.head}>
        <span className={styles.emoji}>{agent.emoji}</span>
        <div>
          <div className={styles.name} style={{ color: agent.color }}>
            {agent.name} {agent.title}
          </div>
          <div className={styles.meta}>
            {info.zoneLabel} · {STATUS_LABEL[avatar?.status ?? 'idle']}
            {avatar?.note ? ` — ${avatar.note}` : ''}
          </div>
        </div>
      </header>

      <p className={styles.specialty}>{agent.specialty}</p>

      {lastSpeech && (
        <p className={styles.quote}>
          “{toPlainText(lastSpeech.text).slice(0, 120)}
          {lastSpeech.text.length > 120 ? '…' : ''}”
        </p>
      )}

      {!expanded ? (
        <button type="button" className={styles.interactHint} onClick={onExpand}>
          <kbd>F</kbd>
          <span>상호작용</span>
        </button>
      ) : (
        <div className={styles.actions} aria-label={`${agent.name} 상호작용`}>
          <button
            type="button"
            onClick={() => onSelectBrief(`${agent.name} ${agent.title}에게 현재 판단과 진행 상황을 직접 보고해달라고 해줘.`)}
          >
            <span aria-hidden="true">💬</span>
            대화 요청
          </button>
          <button
            type="button"
            onClick={() => onSelectBrief(`${agent.dept} ${agent.name}에게 다음 업무를 맡기고 싶어: `)}
          >
            <span aria-hidden="true">📌</span>
            업무 요청
          </button>
        </div>
      )}
    </aside>
  );
}
