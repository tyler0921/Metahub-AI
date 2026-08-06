import { useEffect, useRef, useState } from 'react';
import type { Agent, SpeechEvent } from '@shared';
import { toPlainText } from '@/lib/markdown';
import { useSessionStore, type LogEntry } from '@/store/session.store';
import styles from './ConversationLog.module.css';

/** 이 높이를 넘으면 접고 '더 보기'를 표시 */
const CLIP_HEIGHT = 150;

interface ConversationLogProps {
  theme?: 'light' | 'sidebar';
}

export function ConversationLog({
  theme = 'light',
}: ConversationLogProps): React.JSX.Element {
  const logs = useSessionStore((s) => s.logs);
  const agentMap = useSessionStore((s) => s.agentMap);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = bottomRef.current?.closest('[data-scroll-root]');
    if (root instanceof HTMLElement) {
      root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
    }
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <p className={`${styles.empty} ${theme === 'sidebar' ? styles.sidebarEmpty : ''}`}>
        대표님의 지시를 기다리고 있습니다.
      </p>
    );
  }

  return (
    <div className={`${styles.log} ${theme === 'sidebar' ? styles.sidebarLog : ''}`}>
      {logs.map((entry) => (
        <LogRow
          key={entry.id}
          entry={entry}
          theme={theme}
          resolve={(id) => agentMap.get(id) ?? null}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface LogRowProps {
  entry: LogEntry;
  theme: 'light' | 'sidebar';
  resolve: (id: SpeechEvent['agent']) => Agent | null;
}

function LogRow({ entry, theme, resolve }: LogRowProps): React.JSX.Element | null {
  if (entry.kind === 'system') {
    return (
      <div className={`${styles.system} ${theme === 'sidebar' ? styles.sidebarSystem : ''}`}>
        {entry.text}
      </div>
    );
  }
  return <SpeechRow event={entry.event} theme={theme} resolve={resolve} />;
}

function SpeechRow({
  event,
  theme,
  resolve,
}: {
  event: SpeechEvent;
  theme: 'light' | 'sidebar';
  resolve: LogRowProps['resolve'];
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const speaker = resolve(event.agent);
  const listener = event.to ? resolve(event.to) : null;

  useEffect(() => {
    const el = bodyRef.current;
    if (el) setClipped(el.scrollHeight > CLIP_HEIGHT);
  }, []);

  if (!speaker) return null;

  return (
    <article
      className={`${styles.item} ${theme === 'sidebar' ? styles.sidebarItem : ''}`}
      style={{ borderLeftColor: speaker.color }}
    >
      <header className={styles.head}>
        <span className={styles.who} style={{ color: speaker.color }}>
          {speaker.emoji} {speaker.name} {speaker.title}
        </span>
        {listener && (
          <>
            <span className={styles.arrow}>→</span>
            <span style={{ color: listener.color }}>
              {listener.emoji} {listener.dept}
            </span>
          </>
        )}
        <span className={styles.phase}>{event.phase}</span>
      </header>

      <div
        ref={bodyRef}
        className={[
          styles.body,
          theme === 'sidebar' ? styles.sidebarBody : '',
          expanded ? styles.expanded : '',
          clipped && !expanded ? styles.clipped : '',
          clipped && !expanded && theme === 'sidebar' ? styles.sidebarClipped : '',
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
        {toPlainText(event.text)}
      </div>
    </article>
  );
}
