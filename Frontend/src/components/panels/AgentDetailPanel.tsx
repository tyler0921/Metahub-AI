import type { AgentId } from '@shared';
import { STATUS_COLOR, STATUS_LABEL, deptAbbrev } from '@/lib/agent-status';
import { participationReason } from '@/lib/participation-reason';
import { toPlainText } from '@/lib/markdown';
import { useSessionStore } from '@/store/session.store';
import styles from './AgentDetailPanel.module.css';

interface AgentDetailPanelProps {
  agentId: AgentId;
  onBack: () => void;
  onSelectBrief: (brief: string) => void;
}

/**
 * 캔버스에서 클릭한 직원의 상세.
 *
 * 보여주는 것은 셋입니다 — **무엇을 맡았고 / 지금 어떤 상태이며 / 무슨 말을 했는지.**
 * 직원별 비용은 넣지 않았습니다. 백엔드의 `UsageTracker` 가 세션당 하나라
 * 부서별로 쪼개려면 서버 구조를 바꿔야 하는데, 그건 이 패널과 별개 작업입니다.
 */
export function AgentDetailPanel({
  agentId,
  onBack,
  onSelectBrief,
}: AgentDetailPanelProps): React.JSX.Element | null {
  const agent = useSessionStore((s) => s.agentMap.get(agentId));
  const avatar = useSessionStore((s) => s.avatars.get(agentId));
  const plan = useSessionStore((s) => s.plan);
  const team = useSessionStore((s) => s.team);
  const agentMap = useSessionStore((s) => s.agentMap);
  const logs = useSessionStore((s) => s.logs);

  if (!agent) return null;

  const status = avatar?.status ?? 'idle';
  const note = avatar?.note ?? '';
  const talkingTo = avatar?.talkingTo
    ? agentMap.get(avatar.talkingTo) ?? null
    : null;

  const speeches = logs.filter(
    (entry) => entry.kind === 'speech' && entry.event.agent === agentId,
  );

  /*
   * 지시는 **팀장 단위**로만 내려갑니다. 팀원을 눌렀다면 소속 부서에
   * 내려온 지시를 보여주고, 그게 본인 몫 전부가 아니라는 걸 밝힙니다.
   */
  const assignment = plan?.assignments.find((a) => a.agent === agent.team);
  const isLead = agent.id === agent.team;
  const onTeam =
    team.includes(agent.id) ||
    team.includes(agent.team) ||
    Boolean(assignment);

  return (
    <div className={styles.root}>
      <button type="button" className={styles.back} onClick={onBack}>
        ← 목록으로
      </button>

      <header className={styles.head}>
        <span
          className={styles.badge}
          style={{ '--status-color': STATUS_COLOR[status] } as React.CSSProperties}
        >
          {deptAbbrev(agent.dept)}
        </span>
        <div className={styles.headText}>
          <strong className={styles.name}>
            {agent.name} {agent.title}
          </strong>
          <span className={styles.meta}>
            <i style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
            {agent.dept} · {STATUS_LABEL[status]}
            {note ? ` — ${note}` : ''}
          </span>
        </div>
      </header>

      <p className={onTeam ? styles.chipOn : styles.chipOff}>
        {onTeam ? '이번 업무 참여 중' : '이번 업무 미참여'}
      </p>

      <section className={styles.block}>
        <span className={styles.eyebrow}>전문 영역</span>
        <p>{agent.specialty}</p>
      </section>

      <section className={styles.block}>
        <span className={styles.eyebrow}>참여 이유</span>
        <p>{participationReason(agent)}</p>
      </section>

      <section className={styles.block}>
        <span className={styles.eyebrow}>
          {isLead ? '이번 지시' : `${agent.dept}에 내려온 지시`}
        </span>
        {assignment ? (
          <>
            <p>{assignment.task}</p>
            {!isLead && (
              <p className={styles.aside}>
                팀장이 이 지시를 나눠 배분합니다. 이 직원은 “{agent.specialty}”
                부분을 맡습니다.
              </p>
            )}
          </>
        ) : (
          <p className={styles.aside}>이번 업무에는 투입되지 않았습니다.</p>
        )}
      </section>

      {talkingTo && (
        <section className={styles.block}>
          <span className={styles.eyebrow}>현재 대화 상대</span>
          <p>
            {talkingTo.name} {talkingTo.title} · {talkingTo.dept}
          </p>
        </section>
      )}

      <section className={styles.block}>
        <span className={styles.eyebrow}>발언 · {speeches.length}건</span>
        {speeches.length === 0 ? (
          <p className={styles.aside}>아직 발언이 없습니다.</p>
        ) : (
          <ul className={styles.speeches}>
            {speeches.map((entry) => {
              if (entry.kind !== 'speech') return null;
              return (
                <li key={entry.id}>
                  <span className={styles.speechPhase}>{entry.event.phase}</span>
                  <p>{toPlainText(entry.event.text)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className={styles.actions}>
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
            onSelectBrief(`${agent.dept} ${agent.name}에게 다음 업무를 맡기고 싶어: `)
          }
        >
          업무 요청
        </button>
      </div>
    </div>
  );
}
