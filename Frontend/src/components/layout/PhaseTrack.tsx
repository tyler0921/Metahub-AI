import { PHASE_SEQUENCE } from '@/constants/phases';
import { useSessionStore } from '@/store/session.store';
import styles from './PhaseTrack.module.css';

/** 상단 파이프라인 진행 표시줄 */
export function PhaseTrack(): React.JSX.Element {
  const currentPhase = useSessionStore((s) => s.currentPhase);
  const completedPhases = useSessionStore((s) => s.completedPhases);

  return (
    <nav className={styles.track} aria-label="업무 진행 단계">
      {PHASE_SEQUENCE.map(({ key, label }) => {
        const isActive = currentPhase === key;
        const isPast = !isActive && completedPhases.has(key);

        return (
          <span
            key={key}
            className={[
              styles.pill,
              isActive ? styles.active : '',
              isPast ? styles.past : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={isActive ? 'step' : undefined}
          >
            {label}
          </span>
        );
      })}
    </nav>
  );
}
