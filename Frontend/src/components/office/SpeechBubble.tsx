import type { Agent, AgentStatus } from '@shared';
import { useSessionStore } from '@/store/session.store';
import { STATUS_COLOR } from '@/lib/agent-status';
import styles from './SpeechBubble.module.css';

interface SpeechBubbleProps {
  speaker: Agent;
  listener: Agent | null;
  text: string;
  left: number;
  top: number;
}

const MAX_LENGTH = 110;

function condense(text: string): string {
  const plain = text.replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > MAX_LENGTH ? `${plain.slice(0, MAX_LENGTH)}…` : plain;
}

export function SpeechBubble({
  speaker,
  listener,
  text,
  left,
  top,
}: SpeechBubbleProps): React.JSX.Element {
  const speakerStatus = useSessionStore(
    (s) => s.avatars.get(speaker.id)?.status ?? ('talking' as AgentStatus),
  );

  return (
    <div
      className={styles.bubble}
      style={{
        left,
        top,
        borderTopColor: STATUS_COLOR[speakerStatus],
      }}
    >
      <header className={styles.header}>
        <span className={styles.speaker}>{speaker.name}</span>
        {listener && (
          <span className={styles.target}>→ {listener.dept}</span>
        )}
      </header>
      <p className={styles.body}>{condense(text)}</p>
    </div>
  );
}
