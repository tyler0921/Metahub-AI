import { useEffect, useRef, useState } from 'react';
import type { Agent, AgentId } from '@shared';
import { participationReason } from '@/lib/participation-reason';
import type { TimelineEntry } from '@/lib/timeline';
import { toPlainText } from '@/lib/markdown';
import { useSessionStore } from '@/store/session.store';
import { ReviewCard } from './ReviewCard';
import styles from './WorkTimeline.module.css';

const CLIP_HEIGHT = 120;

const KIND_LABEL: Record<TimelineEntry['kind'], string> = {
  brief: '업무 접수',
  recall: '자료 회상',
  plan: '팀 구성',
  phase: '단계 시작',
  speech: '직원 발언',
  artifact: '파일 생성',
  review: '검토 결과',
  tool: '도구 사용',
  done: '완료',
  cancelled: '중단',
  error: '오류',
};

/** SessionEvent 기반 구조화 타임라인 — 대화/시스템 로그 혼합을 카드로 바꿉니다. */
export function WorkTimeline(): React.JSX.Element {
  const timeline = useSessionStore((s) => s.timeline);
  const agentMap = useSessionStore((s) => s.agentMap);
  const selectAgent = useSessionStore((s) => s.selectAgent);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = bottomRef.current?.closest('[data-scroll-root]');
    if (root instanceof HTMLElement) {
      root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
    }
  }, [timeline.length]);

  if (timeline.length === 0) {
    return (
      <p className={styles.empty}>대표님의 지시를 기다리고 있습니다.</p>
    );
  }

  return (
    <div className={styles.list}>
      {timeline.map((entry) => (
        <TimelineCard
          key={entry.id}
          entry={entry}
          agentMap={agentMap}
          onSelectAgent={selectAgent}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function TimelineCard({
  entry,
  agentMap,
  onSelectAgent,
}: {
  entry: TimelineEntry;
  agentMap: Map<AgentId, Agent>;
  onSelectAgent: (id: AgentId | null) => void;
}): React.JSX.Element {
  const label = KIND_LABEL[entry.kind];

  if (entry.kind === 'speech') {
    return (
      <SpeechCard
        entry={entry}
        agentMap={agentMap}
        onSelectAgent={onSelectAgent}
      />
    );
  }

  if (entry.kind === 'review') {
    return (
      <article className={`${styles.card} ${styles.review}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        <ReviewCard
          review={entry.review}
          attempt={entry.attempt}
          compact
        />
      </article>
    );
  }

  if (entry.kind === 'plan') {
    return (
      <article className={`${styles.card} ${styles.plan}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        <p className={styles.title}>{entry.goal}</p>
        <p className={styles.meta}>산출물 · {entry.deliverable}</p>
        <ul className={styles.team}>
          {entry.team.map((id) => {
            const agent = agentMap.get(id);
            if (!agent) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => onSelectAgent(id)}>
                  <strong>
                    {agent.dept} {agent.name}
                  </strong>
                  <span>{participationReason(agent)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </article>
    );
  }

  if (entry.kind === 'brief') {
    return (
      <article className={`${styles.card} ${styles.brief}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        <p className={styles.title}>“{entry.text}”</p>
      </article>
    );
  }

  if (entry.kind === 'recall') {
    return (
      <article className={styles.card}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        {entry.titles.length === 0 ? (
          <p className={styles.meta}>관련 과거 기록 없음</p>
        ) : (
          <ul className={styles.bullets}>
            {entry.titles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        )}
      </article>
    );
  }

  if (entry.kind === 'phase') {
    return (
      <article className={`${styles.card} ${styles.phase}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
          <span className={styles.phaseKey}>{entry.key}</span>
        </header>
        <p className={styles.title}>{entry.label}</p>
      </article>
    );
  }

  if (entry.kind === 'artifact') {
    return (
      <article className={`${styles.card} ${styles.artifact}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        <p className={styles.title}>
          <code>{entry.path}</code>
        </p>
        <p className={styles.meta}>{entry.bytes.toLocaleString()} B</p>
      </article>
    );
  }

  if (entry.kind === 'tool') {
    const agent = agentMap.get(entry.agent);
    const toolName = entry.tool === 'vault' ? 'Vault' : '파일 작성';
    const statusText =
      entry.status === 'failed' ? '실패' : entry.status === 'completed' ? '완료' : '시작';

    return (
      <article className={`${styles.card} ${styles.tool}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
          <span className={styles.phaseKey}>{statusText}</span>
        </header>
        <p className={styles.title}>
          {toolName}
          {entry.label ? ` · ${entry.label}` : ''}
        </p>
        {agent && (
          <p className={styles.meta}>
            <button type="button" className={styles.agentLink} onClick={() => onSelectAgent(entry.agent)}>
              {agent.dept} {agent.name}
            </button>
          </p>
        )}
      </article>
    );
  }

  if (entry.kind === 'done') {
    return (
      <article className={`${styles.card} ${styles.done}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
          <span className={styles.phaseKey}>{entry.deliverableKind}</span>
        </header>
        <p className={styles.title}>{entry.summary}</p>
      </article>
    );
  }

  if (entry.kind === 'cancelled') {
    return (
      <article className={`${styles.card} ${styles.warn}`}>
        <header className={styles.head}>
          <span className={styles.kind}>{label}</span>
        </header>
        <p className={styles.title}>{entry.reason}</p>
      </article>
    );
  }

  return (
    <article className={`${styles.card} ${styles.error}`}>
      <header className={styles.head}>
        <span className={styles.kind}>{label}</span>
      </header>
      <p className={styles.title}>{entry.message}</p>
    </article>
  );
}

function SpeechCard({
  entry,
  agentMap,
  onSelectAgent,
}: {
  entry: Extract<TimelineEntry, { kind: 'speech' }>;
  agentMap: Map<AgentId, Agent>;
  onSelectAgent: (id: AgentId | null) => void;
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const speaker = agentMap.get(entry.event.agent);
  const listener = entry.event.to ? agentMap.get(entry.event.to) : null;

  useEffect(() => {
    const el = bodyRef.current;
    if (el) setClipped(el.scrollHeight > CLIP_HEIGHT);
  }, [entry.event.text]);

  if (!speaker) return null;

  return (
    <article className={`${styles.card} ${styles.speech}`}>
      <header className={styles.head}>
        <span className={styles.kind}>{KIND_LABEL.speech}</span>
        <span className={styles.phaseKey}>{entry.event.phase}</span>
      </header>
      <button
        type="button"
        className={styles.speaker}
        onClick={() => onSelectAgent(speaker.id)}
      >
        {speaker.name} {speaker.title}
        {listener && <span> → {listener.dept}</span>}
      </button>
      <div
        ref={bodyRef}
        className={[
          styles.speechBody,
          expanded ? styles.expanded : '',
          clipped && !expanded ? styles.clipped : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => setExpanded((v) => !v)}
        role={clipped ? 'button' : undefined}
        tabIndex={clipped ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v);
        }}
      >
        {toPlainText(entry.event.text)}
      </div>
    </article>
  );
}
