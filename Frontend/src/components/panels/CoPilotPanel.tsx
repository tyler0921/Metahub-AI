import type { PhaseKey } from '@shared';
import { PHASE_SEQUENCE, phaseIndexOf, phaseLabelOf } from '@/constants/phases';
import { deptAbbrev, STATUS_COLOR, STATUS_LABEL } from '@/lib/agent-status';
import { useSessionStore } from '@/store/session.store';
import styles from './CoPilotPanel.module.css';

interface CoPilotPanelProps {
  className?: string;
  theme?: 'dark' | 'light';
  onSelectBrief: (brief: string) => void;
}

interface SmartPrompt {
  label: string;
  brief: string;
}

const SMART_PROMPTS: readonly SmartPrompt[] = [
  {
    label: '요약하기',
    brief: '지금까지 논의된 내용을 핵심만 요약해서 보고해줘.',
  },
  {
    label: '문서 초안',
    brief: '논의 내용을 바탕으로 실행 가능한 문서 초안을 작성해줘.',
  },
  {
    label: '브레인스토밍',
    brief: '이 주제에 대해 부서별로 창의적인 아이디어 3가지씩 제안해줘.',
  },
  {
    label: '리스크 분석',
    brief: '현재 계획의 잠재 리스크와 대응 방안을 부서별로 분석해줘.',
  },
];

const phaseLabel = (key: PhaseKey | null): string =>
  key ? phaseLabelOf(key) : '대기';

/** Co-pilot 추천 액션 + 스마트 프롬프트 + 투입 부서 진행 스택 */
export function CoPilotPanel({
  className,
  theme = 'dark',
  onSelectBrief,
}: CoPilotPanelProps): React.JSX.Element {
  const isRunning = useSessionStore((s) => s.isRunning);
  const currentPhase = useSessionStore((s) => s.currentPhase);
  const result = useSessionStore((s) => s.result);
  const logs = useSessionStore((s) => s.logs);
  const team = useSessionStore((s) => s.team);
  const agentMap = useSessionStore((s) => s.agentMap);
  const avatars = useSessionStore((s) => s.avatars);

  const phaseProgress = currentPhase
    ? Math.round(((phaseIndexOf(currentPhase) + 1) / PHASE_SEQUENCE.length) * 100)
    : result
      ? 100
      : 0;

  const actions: readonly string[] = (() => {
    if (result) {
      return ['산출물 검토하기', '볼트에 저장된 노트 확인', '후속 과제 지시하기'];
    }
    if (isRunning) {
      return [
        `${phaseLabel(currentPhase)} 단계 진행 중`,
        '진행 상황 요약 요청',
        '교차검토 의견 확인',
      ];
    }
    if (logs.length > 0) {
      return ['이전 대화 이어서 진행', '요약 보고서 요청', '새 프로젝트 시작'];
    }
    return ['시장 조사 프로젝트 시작', '기술 검토 요청', '마케팅 전략 수립'];
  })();

  const showDeptStack = isRunning && team.length > 0;

  return (
    <section
      className={[
        styles.panel,
        theme === 'light' ? styles.light : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-label="Co-pilot"
    >
      <header className={styles.titleBar}>
        <span className={styles.title}>빠른 실행</span>
        <span className={styles.titleHint}>AI COPILOT</span>
      </header>

      <div className={styles.body}>
        {showDeptStack && (
          <>
            <h3 className={styles.sectionLabel}>투입 부서 · {phaseProgress}%</h3>
            <ul className={styles.deptStack}>
              {team.map((id) => {
                const agent = agentMap.get(id);
                const avatar = avatars.get(id);
                if (!agent) return null;
                const status = avatar?.status ?? 'idle';
                return (
                  <li key={id} className={styles.deptRow}>
                    <span className={styles.deptBadge}>{deptAbbrev(agent.dept)}</span>
                    <div className={styles.deptCopy}>
                      <strong>{agent.dept}</strong>
                      <small style={{ color: STATUS_COLOR[status] }}>
                        {STATUS_LABEL[status]}
                      </small>
                    </div>
                    <span className={styles.deptBar} aria-hidden="true">
                      <i
                        style={{
                          width: `${phaseProgress}%`,
                          background: STATUS_COLOR[status],
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <h3 className={styles.sectionLabel}>추천 다음 액션</h3>
        <ul className={styles.actionList}>
          {actions.map((action) => (
            <li key={action}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => onSelectBrief(action.endsWith('시작') ? action : `${action}해줘.`)}
              >
                <span>{action}</span>
                <span className={styles.arrow}>›</span>
              </button>
            </li>
          ))}
        </ul>

        <h3 className={styles.sectionLabel}>스마트 프롬프트</h3>
        <div className={styles.promptGrid}>
          {SMART_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              className={styles.promptBtn}
              onClick={() => onSelectBrief(prompt.brief)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
