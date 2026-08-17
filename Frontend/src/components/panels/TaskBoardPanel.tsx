import type { AgentStatus, PhaseKey } from '@shared';
import { STATUS_COLOR, STATUS_LABEL, deptAbbrev } from '@/lib/agent-status';
import { participationReason } from '@/lib/participation-reason';
import { useSessionStore } from '@/store/session.store';
import styles from './TaskBoardPanel.module.css';

/**
 * 부서 하나가 지금 어디까지 왔는지.
 *
 * 파이프라인이 단계 기반이라 부서마다 독립적인 진척률은 없습니다.
 * 대신 **초안 → 검토 → 개정**이 실제 의존 관계이므로 그걸 그대로 보여줍니다.
 * 없는 진척률을 만들어내는 것보다 정직하고, 읽는 사람에게도 더 쓸모 있습니다.
 */
const TRACK: ReadonlyArray<{ key: PhaseKey; label: string }> = [
  { key: 'draft', label: '초안' },
  { key: 'feedback', label: '검토' },
  { key: 'revise', label: '개정' },
];

/**
 * 작업 보드.
 *
 * 비서실장이 쪼갠 업무 계획을 그대로 렌더합니다. 데이터는 이미 `plan`
 * 이벤트로 넘어오고 있었고 지금까지 화면에 쓰이지 않았습니다.
 */
export function TaskBoardPanel(): React.JSX.Element {
  const plan = useSessionStore((s) => s.plan);
  const agentMap = useSessionStore((s) => s.agentMap);
  const avatars = useSessionStore((s) => s.avatars);
  const completedPhases = useSessionStore((s) => s.completedPhases);
  const currentPhase = useSessionStore((s) => s.currentPhase);
  const isRunning = useSessionStore((s) => s.isRunning);
  const selectAgent = useSessionStore((s) => s.selectAgent);

  if (!plan) {
    return (
      <p className={styles.empty}>
        {isRunning
          ? '비서실장이 업무를 쪼개는 중입니다…'
          : '지시를 내리면 부서별 업무가 여기에 나타납니다.'}
      </p>
    );
  }

  const phaseState = (key: PhaseKey): 'done' | 'active' | 'todo' => {
    if (completedPhases.has(key)) return 'done';
    if (currentPhase === key) return 'active';
    return 'todo';
  };

  return (
    <div className={styles.root}>
      <section className={styles.goal}>
        <span className={styles.eyebrow}>목표</span>
        <p>{plan.goal}</p>
      </section>

      {plan.successCriteria.length > 0 && (
        <section className={styles.criteria}>
          <span className={styles.eyebrow}>성공 기준</span>
          <ul>
            {plan.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <span className={styles.eyebrow}>
          부서별 업무 · {plan.assignments.length}건
        </span>

        <ul className={styles.tasks}>
          {plan.assignments.map((assignment) => {
            const agent = agentMap.get(assignment.agent);
            const status: AgentStatus =
              avatars.get(assignment.agent)?.status ?? 'idle';

            return (
              <li key={assignment.agent}>
                <button
                  type="button"
                  className={styles.task}
                  onClick={() => selectAgent(assignment.agent)}
                >
                  <header className={styles.taskHead}>
                    <span
                      className={styles.badge}
                      style={
                        {
                          '--status-color': STATUS_COLOR[status],
                        } as React.CSSProperties
                      }
                    >
                      {deptAbbrev(agent?.dept ?? assignment.agent)}
                    </span>
                    <span className={styles.dept}>
                      {agent?.dept ?? assignment.agent}
                    </span>
                    <span
                      className={styles.status}
                      style={{ color: STATUS_COLOR[status] }}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </header>

                  <p className={styles.taskBody}>{assignment.task}</p>

                  {agent && (
                    <p className={styles.reason}>{participationReason(agent)}</p>
                  )}

                  <div className={styles.track} aria-label="진행 단계">
                    {TRACK.map((step) => (
                      <span
                        key={step.key}
                        className={`${styles.step} ${styles[phaseState(step.key)]}`}
                      >
                        {step.label}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className={styles.hint}>
        항목을 누르면 해당 직원의 상세로 이동합니다.
      </p>
    </div>
  );
}
