import type { Agent, SpeechEvent } from '@shared';
import { STATUS_COLOR } from '@/lib/agent-status';
import styles from './ConversationFlow.module.css';

interface Point {
  left: number;
  top: number;
}

interface ConversationFlowProps {
  speeches: SpeechEvent[];
  agents: Map<string, Agent>;
  anchors: Map<string, Point>;
}

interface ConversationLink {
  key: string;
  path: string;
  from: Point;
  to: Point;
  delay: string;
}

const ACTOR_CENTER_OFFSET = 34;
const FLOW_STROKE = STATUS_COLOR.talking;

function makePath(from: Point, to: Point, index: number): string {
  const x1 = from.left;
  const y1 = from.top + ACTOR_CENTER_OFFSET;
  const x2 = to.left;
  const y2 = to.top + ACTOR_CENTER_OFFSET;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(34, distance * 0.14) * (index % 2 === 0 ? 1 : -1);
  const cx = (x1 + x2) / 2 - (dy / distance) * bend;
  const cy = (y1 + y2) / 2 + (dx / distance) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function ConversationFlow({
  speeches,
  agents,
  anchors,
}: ConversationFlowProps): React.JSX.Element | null {
  const links: ConversationLink[] = [];

  speeches.forEach((speech, index) => {
    if (!speech.to) return;
    const from = anchors.get(speech.agent);
    const to = anchors.get(speech.to);
    if (!from || !to || !agents.has(speech.agent) || !agents.has(speech.to)) return;

    links.push({
      key: `${speech.agent}-${speech.to}-${speech.at}`,
      path: makePath(from, to, index),
      from,
      to,
      delay: `${(index * 0.23).toFixed(2)}s`,
    });
  });

  if (links.length === 0) return null;

  return (
    <svg className={styles.layer} aria-hidden="true">
      {links.map((link) => (
        <g key={link.key}>
          <path className={styles.shadow} d={link.path} />
          <path className={styles.flow} d={link.path} stroke={FLOW_STROKE} />
          <circle
            className={styles.speakerPulse}
            cx={link.from.left}
            cy={link.from.top + ACTOR_CENTER_OFFSET}
            r="13"
            stroke={FLOW_STROKE}
          />
          <circle
            className={styles.listenerPulse}
            cx={link.to.left}
            cy={link.to.top + ACTOR_CENTER_OFFSET}
            r="13"
            stroke={FLOW_STROKE}
          />
          <circle r="3.5" fill={FLOW_STROKE} className={styles.messageDot}>
            <animateMotion
              dur="1.35s"
              begin={link.delay}
              repeatCount="indefinite"
              path={link.path}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}
