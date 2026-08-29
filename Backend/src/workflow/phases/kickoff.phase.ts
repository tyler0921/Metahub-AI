import { Injectable } from '@nestjs/common';
import type {
  AgentId,
  Assignment,
  Deliverable,
  DeliverableKind,
  PhaseKey,
  WorkPlan,
} from '@shared';
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
  kind?: string;
  assignments?: Array<{ agent?: string; task?: string }>;
}

/**
 * 지시문에 이런 말이 들어 있으면 "만들어 달라"는 뜻으로 봅니다.
 *
 * 로컬 8B 모델은 kind 판정을 자주 틀립니다 — "랜딩페이지를 만들어줘" 를
 * 받고도 기획안을 쓰겠다고 하는 식입니다. 그래서 LLM 판정만 믿지 않고
 * 이 규칙을 함께 봅니다. 둘 중 하나라도 website 면 website 입니다.
 */
const BUILD_INTENT =
  /(랜딩\s*페이지|랜딩페이지|웹\s*페이지|웹페이지|웹사이트|홈페이지|사이트|landing\s*page|website|웹앱|프로토타입|화면\s*구현|퍼블리싱|html)/i;

/** 반대로 이런 말이 붙으면 "문서로 정리해 달라"는 뜻입니다 */
const DOCUMENT_INTENT =
  /(기획안|보고서|제안서|계획서|전략|분석해|조사해|정리해\s*줘|검토해)/i;

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

    session.plan = this.normalize(raw, agents, session.brief);
    session.emit({ type: 'plan', plan: session.plan, team: session.team });

    const depts = session.plan.assignments
      .map((a) => agents.findById(a.agent).dept)
      .join(', ');
    narrator.say(
      'chief',
      session.plan.kind === 'website'
        ? `목표는 "${session.plan.goal}" 입니다. 이번 건은 문서가 아니라 **실물을 만드는 일**이므로, 개발팀이 최종 파일까지 만들어냅니다. ${depts} 투입하겠습니다.`
        : `목표는 "${session.plan.goal}" 입니다. ${depts} 투입하겠습니다.`,
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
      '## 먼저 판단할 것 — 대표님이 원하는 게 "문서"인가 "실물"인가',
      '',
      '- `document` : 읽고 판단하기 위한 보고서·기획안·전략안. 결과는 마크다운 문서 한 편입니다.',
      '- `website`  : 브라우저에서 바로 열리는 **실제 웹페이지**. 결과는 html/css/js 파일입니다.',
      '',
      '"랜딩페이지를 만들어줘", "소개 사이트 하나 뽑아줘" 처럼 **결과물을 직접 쓰겠다는 지시**는 website 입니다.',
      '"랜딩페이지 기획안을 써줘" 처럼 문서를 요청하면 document 입니다.',
      '',
      'website 라면 부서 배정도 달라져야 합니다.',
      `- \`dev\` 는 **반드시** 포함하세요. 실제 코드를 쓰는 유일한 부서입니다.`,
      '- `marketer` 에게는 "화면에 그대로 들어갈 헤드라인·본문 카피"를 쓰게 하세요. 채널 전략은 필요 없습니다.',
      '- `planner` 에게는 "페이지 섹션 구성과 각 섹션의 목적"을 정하게 하세요.',
      '- 재무·리서치는 이번 일에 실제로 필요할 때만 부르세요.',
      '',
      '다음 스키마의 JSON으로 답하세요:',
      '{',
      '  "goal": "이 일의 목표를 한 문장으로",',
      '  "kind": "document" 또는 "website",',
      '  "successCriteria": ["측정 가능한 성공 기준", "..."],',
      '  "deliverable": "최종 산출물의 형태 (예: 실행 계획서, 회사 소개 랜딩페이지)",',
      '  "assignments": [{"agent": "부서id", "task": "구체적인 업무 지시 2~4문장"}]',
      '}',
    ].join('\n');
  }

  /**
   * 산출물 종류 판정.
   *
   * LLM 의 답과 지시문 규칙을 **둘 다** 봅니다. 로컬 소형 모델이
   * kind 를 빠뜨리거나 틀리는 일이 잦아서, 지시문에 "만들어줘" 신호가
   * 분명하면 규칙이 이깁니다. 반대로 "기획안" 처럼 문서를 못박은
   * 표현이 함께 있으면 문서가 우선입니다.
   */
  private resolveKind(raw: RawPlan, brief: string): DeliverableKind {
    if (DOCUMENT_INTENT.test(brief)) return 'document';
    if (BUILD_INTENT.test(brief)) return 'website';
    return raw.kind === 'website' ? 'website' : 'document';
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
  private normalize(
    raw: RawPlan,
    agents: PhaseContext['agents'],
    brief: string,
  ): WorkPlan {
    const kind = this.resolveKind(raw, brief);

    let assignments: Assignment[] = (raw.assignments ?? [])
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

    // 한 부서도 못 고른 경우 기획팀에 통째로 맡긴다
    if (assignments.length === 0) {
      assignments = [
        { agent: 'planner', task: '대표 지시를 검토해 실행 계획을 세울 것' },
      ];
    }

    // 만드는 일인데 개발팀이 빠졌다면 아무것도 만들어지지 않습니다.
    // 자리가 없으면 가장 관련이 먼 부서를 밀어내고 넣습니다.
    if (kind === 'website' && !assignments.some((a) => a.agent === 'dev')) {
      const devTask: Assignment = {
        agent: 'dev',
        task: '다른 부서가 정한 구성과 카피를 받아 실제로 동작하는 웹페이지를 구현할 것. 단일 HTML + CSS + 최소한의 JS 로 만든다.',
      };
      assignments =
        assignments.length < MAX_ASSIGNMENTS
          ? [...assignments, devTask]
          : [...assignments.slice(0, MAX_ASSIGNMENTS - 1), devTask];
    }

    return {
      goal: raw.goal?.trim() || '대표 지시 이행',
      successCriteria: (raw.successCriteria ?? []).filter(Boolean),
      deliverable:
        raw.deliverable?.trim() || (kind === 'website' ? '웹페이지' : '보고서'),
      kind,
      assignments,
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
      // 만드는 일이라는 걸 전 부서가 알아야 원고의 성격이 달라집니다.
      // 이 문장이 없으면 마케팅팀이 "카피 전략"을 쓰고 실제 카피는 안 씁니다.
      plan.kind === 'website'
        ? [
            '\n## ⚠️ 이번 건은 문서가 아니라 실물입니다',
            '최종 결과물은 브라우저에서 바로 열리는 **웹페이지 파일**입니다.',
            '따라서 각 부서의 원고는 "제안"이 아니라 **페이지에 그대로 들어갈 재료**여야 합니다.',
            '- 카피는 예시가 아니라 실제로 쓸 최종 문구를 씁니다.',
            '- 구성은 위에서 아래로 이어지는 섹션 순서로 씁니다.',
            '- "~하는 것이 좋겠습니다" 같은 제안형 문장 대신 확정된 내용을 씁니다.',
          ].join('\n')
        : '',
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
