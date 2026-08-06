import { Injectable } from '@nestjs/common';
import type { AgentId, Assignment, Deliverable, PhaseKey, WorkPlan } from '@shared';
import { buildDateContext } from '../../common/utils/date.util';
import { LlmService } from '../../llm/llm.service';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

/**
 * 한 번에 투입할 수 있는 부서 수 상한.
 *
 * 교차검토가 n×(n-1) 로 늘어나기 때문에 상한이 없으면 부서가 많을수록
 * 호출 수가 급격히 불어납니다. 로컬 모델에서는 특히 치명적입니다.
 */
const MAX_ASSIGNMENTS = 4;

/** 컨텍스트가 무한정 길어지지 않게 자릅니다 */
function truncate(text: string, limit: number): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n\n…(이하 ${text.length - limit}자 생략)`;
}

/** LLM 이 돌려주는 원본 형태 (필드가 빠질 수 있으므로 전부 optional) */
interface RawPlan {
  goal?: string;
  successCriteria?: string[];
  deliverable?: string;
  assignments?: Array<{ agent?: string; task?: string }>;
}

/**
 * 1단계 — 착수.
 * 비서실장이 대표 지시를 목표·성공기준·부서별 업무로 분해합니다.
 */
@Injectable()
export class KickoffPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'kickoff';
  readonly label = '비서실장 업무 분해';

  constructor(private readonly llm: LlmService) {}

  async execute({ session, agents, recallContext }: PhaseContext): Promise<void> {
    const narrator = new PhaseNarrator(session, '착수');
    const chief = agents.chief;

    narrator.status('chief', 'thinking', '업무 분해 중');

    const raw = await this.llm.completeJson<RawPlan>(
      chief.systemPrompt,
      this.buildPrompt(session, recallContext, agents),
      { maxTokens: 2000, signal: session.signal },
      session.usage,
    );

    session.plan = this.normalize(raw, agents);
    session.emit({ type: 'plan', plan: session.plan, team: session.team });

    const depts = session.plan.assignments
      .map((a) => agents.findById(a.agent).dept)
      .join(', ');
    narrator.say(
      'chief',
      `목표는 "${session.plan.goal}" 입니다. ${depts} 투입하겠습니다.`,
    );

    for (const assignment of session.plan.assignments) {
      session.tasks.set(assignment.agent, assignment.task);
      narrator.say('chief', assignment.task, assignment.agent, '지시');
    }

    narrator.status('chief', 'idle');
    session.sharedContext = this.buildSharedContext(
      session.plan,
      session.brief,
      recallContext,
      session.parentResult,
    );
  }

  private buildPrompt(
    session: PhaseContext['session'],
    recallContext: string,
    agents: PhaseContext['agents'],
  ): string {
    // 배정 대상은 **팀장**뿐입니다. 팀원은 팀장이 알아서 나눠 씁니다.
    const roster = agents
      .findAssignableLeads()
      .map((lead) => {
        const members = agents
          .findTeammates(lead.team)
          .map((m) => `${m.displayName}(${m.specialty})`)
          .join(', ');
        return (
          `- ${lead.id} : ${lead.dept} ${lead.displayName} — ${lead.specialty}` +
          (members ? `\n    팀원: ${members}` : '')
        );
      })
      .join('\n');

    return [
      ...this.briefBlock(session),
      recallContext,
      '가용한 부서는 다음과 같습니다.',
      roster,
      '',
      '이 지시를 수행하는 데 실제로 **필요한 부서만** 고르세요.',
      `최대 ${MAX_ASSIGNMENTS}개까지만 고를 수 있습니다. 부서 하나가 늘 때마다 전체 소요 시간이 눈에 띄게 늘어납니다.`,
      '각 부서는 팀장 아래 팀원들이 나눠서 작업하므로, 부서 단위로만 지시하세요.',
      '각 부서에는 "무엇을, 왜, 어떤 형식으로" 가 담긴 구체적 지시를 내리세요.',
      '',
      '다음 스키마의 JSON으로 답하세요:',
      '{',
      '  "goal": "이 일의 목표를 한 문장으로",',
      '  "successCriteria": ["측정 가능한 성공 기준", "..."],',
      '  "deliverable": "최종 산출물의 형태 (예: 실행 계획서, 마케팅 기획안, 기술 검토 보고서)",',
      '  "assignments": [{"agent": "부서id", "task": "구체적인 업무 지시 2~4문장"}]',
      '}',
    ].join('\n');
  }

  /**
   * 지시문 블록.
   *
   * 후속 지시(이어서 지시)면 이전 산출물을 함께 붙여, 백지가 아니라
   * **고쳐 쓰는 일**로 인식하게 만듭니다. 그러지 않으면 같은 문서를
   * 처음부터 다시 쓰느라 시간만 두 배로 듭니다.
   */
  private briefBlock(session: PhaseContext['session']): string[] {
    const previous = session.parentResult;
    if (!previous) {
      return ['대표님이 다음과 같이 지시하셨습니다.', '', '```', session.brief, '```'];
    }

    const unresolved = (previous.review?.issues ?? [])
      .map((issue) => `- ${issue}`)
      .join('\n');

    return [
      '이것은 **후속 지시**입니다. 이미 한 번 보고를 마친 건에 대해 대표님이 추가 요청을 하셨습니다.',
      '',
      '## 지난번 대표 지시',
      '```',
      previous.brief,
      '```',
      '',
      '## 지난번 최종 산출물',
      '```markdown',
      truncate(previous.body, 6000),
      '```',
      ...(unresolved
        ? ['', '## 지난 검수에서 남았던 지적', unresolved]
        : []),
      '',
      '## 이번 대표 지시 (추가 요청)',
      '```',
      session.brief,
      '```',
      '',
      '**처음부터 다시 만들지 마세요.** 위 산출물을 출발점으로 삼아',
      '이번 추가 요청에 실제로 손이 필요한 부분만 골라 부서를 배정하세요.',
      '이번 요청과 무관한 부서는 부르지 마세요.',
    ];
  }

  /** LLM 이 만들어낸 잘못된 부서 id 를 걸러내고 안전한 기본값을 채운다 */
  private normalize(raw: RawPlan, agents: PhaseContext['agents']): WorkPlan {
    const assignments: Assignment[] = (raw.assignments ?? [])
      .filter(
        (a): a is { agent: string; task: string } =>
          typeof a.agent === 'string' && typeof a.task === 'string',
      )
      .filter((a) => {
        if (!agents.exists(a.agent)) return false;
        const found = agents.findById(a.agent as AgentId);
        // 팀장만 배정 대상입니다 (팀원은 팀장이 나눠 씁니다)
        return found.isStaff && found.isLead;
      })
      .map((a) => ({ agent: a.agent as AgentId, task: a.task }))
      // 중복 부서 제거 후 상한 적용
      .filter((a, i, all) => all.findIndex((x) => x.agent === a.agent) === i)
      .slice(0, MAX_ASSIGNMENTS);

    return {
      goal: raw.goal?.trim() || '대표 지시 이행',
      successCriteria: (raw.successCriteria ?? []).filter(Boolean),
      deliverable: raw.deliverable?.trim() || '보고서',
      // 한 부서도 못 고른 경우 기획팀에 통째로 맡긴다
      assignments: assignments.length > 0 ? assignments : [{ agent: 'planner', task: '대표 지시를 검토해 실행 계획을 세울 것' }],
    };
  }

  private buildSharedContext(
    plan: WorkPlan,
    brief: string,
    recallContext: string,
    previous: Deliverable | null,
  ): string {
    return [
      buildDateContext(),
      `\n## 대표 지시\n${brief}`,
      `\n## 회사 목표\n${plan.goal}`,
      `\n## 성공 기준\n${plan.successCriteria.map((c) => `- ${c}`).join('\n')}`,
      `\n## 최종 산출물 형태\n${plan.deliverable}`,
      // 후속 지시면 전 부서가 지난 산출물을 보고 이어서 작업합니다
      previous
        ? `\n## 지난번 산출물 (이번엔 이것을 고쳐 씁니다)\n${truncate(previous.body, 6000)}`
        : '',
      recallContext,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
