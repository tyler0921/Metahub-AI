import type { Agent } from '@shared';
import styles from './SpeechBubble.module.css';

interface SpeechBubbleProps {
  /** 말하는 사람 — 말풍선 테두리 색으로 씁니다 */
  speaker: Agent;
  /** 지목한 상대 (없으면 혼잣말) */
  listener: Agent | null;
  text: string;
  left: number;
  top: number;
}

const MAX_LENGTH = 110;

/** 마크다운 기호를 걷어내고 한 줄로 줄입니다 */
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
  return (
    <div
      className={styles.bubble}
      style={{ left, top, borderTopColor: speaker.color }}
    >
      {listener && <b style={{ color: listener.color }}>→ {listener.dept} </b>}
      {condense(text)}
    </div>
  );
}
