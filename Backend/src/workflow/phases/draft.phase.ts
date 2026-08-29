import { Injectable, Logger } from '@nestjs/common';
import type { AgentId, PhaseKey } from '@shared';
import type { AgentEntity } from '../../agents/entities/agent.entity';
import { LlmService } from '../../llm/llm.service';
import { WebSearchService } from '../../search/web-search.service';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

/**
 * 2단계 — 초안.
 *
 * 배정된 부서마다 **팀 전체가 나눠서 씁니다.**
 *   선임·사원이 각자 맡은 관점으로 동시에 작성 → 팀장이 하나로 통합
 *
 * 부서 대표로 다음 단계(교차검토)에 나가는 것은 팀장이 통합한 원고입니다.
 * 팀원까지 교차검토에 넣으면 검토 조합이 n×(n-1) 로 폭발하기 때문입니다.
 */
@Injectable()
export class DraftPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'draft';
  readonly label = '부서별 초안 작성';
  private readonly logger = new Logger(DraftPhase.name);

  constructor(
    private readonly llm: LlmService,
    private readonly webSearch: WebSearchService,
  ) {}

  async execute(context: PhaseContext): Promise<void> {
    const { session, agents } = context;
    const narrator = new PhaseNarrator(session, '초안');

    await Promise.all(
      session.plan.assignments.map(async ({ agent, task }) => {
        const lead = agents.findById(agent);
        const teammates = agents.findTeammates(lead.team);

        // 팀원이 없으면 팀장이 혼자 씁니다
        if (teammates.length === 0) {
          const solo = await this.writeSection(context, narrator, lead, task, null);
          session.drafts.set(agent, solo);
          narrator.status(agent, 'done', '초안 완료');
          narrator.say(agent, solo, 'chief');
          return;
        }

        narrator.say(
          agent,
          `${teammates.map((m) => m.displayName).join(', ')} 와 나눠서 작업하겠습니다.`,
          'chief',
          '분담',
        );

        // 1) 팀원들이 각자 관점으로 동시에 작성
        const sections = await Promise.all(
          teammates.map(async (member) => {
            narrator.status(member.id, 'thinking', `${lead.dept} 초안 작성 중`);
            const text = await this.writeSection(context, narrator, member, task, lead);
            narrator.status(member.id, 'done', '작성 완료');
            narrator.say(member.id, text, agent);
            return { member, text };
          }),
        );

        // 2) 팀장이 팀원 원고를 하나로 통합
        narrator.status(agent, 'thinking', '팀 원고 통합 중');
        const merged = await this.mergeTeamDraft(context, lead, task, sections);

        session.drafts.set(agent, merged);
        narrator.status(agent, 'done', '초안 완료');
        narrator.say(agent, merged, 'chief');
      }),
    );
  }

  /** 한 사람이 자기 관점으로 쓰는 원고 */
  private async writeSection(
    { session }: PhaseContext,
    narrator: PhaseNarrator,
    author: AgentEntity,
    task: string,
    lead: AgentEntity | null,
  ): Promise<string> {
    const isMember = lead !== null;
    const searchBlock = await this.researchBlock(narrator, author, task);

    return this.llm.complete(
      author.systemPrompt,
      [
        session.sharedContext,
        `\n## ${isMember ? `${lead.dept} 에 내려진 지시` : `당신에게 내려진 지시 (비서실장 → ${author.dept})`}\n${task}`,
        '',
        isMember
          ? `당신은 이 지시 중 **"${author.specialty}"** 부분만 맡습니다. ` +
            `${lead.displayName}이(가) 나중에 팀원 원고를 합칠 예정이니, 당신 몫만 깊게 쓰세요.`
          : '당신의 전문 영역에 해당하는 부분만 작성하세요. 다른 부서 일까지 대신 하지 마세요.',
        '',
        '마크다운으로, 소제목을 써서 구조적으로 작성하세요. 서론 없이 바로 본론부터 시작하세요.',
        ...searchBlock,
      ].join('\n'),
      { maxTokens: isMember ? 1800 : 3000, signal: session.signal },
      session.usage,
    );
  }

  /**
   * 리서치팀 전용 — 실시간 검색 결과를 프롬프트에 넣습니다.
   *
   * 검색이 꺼져 있거나 실패해도(웹 검색 서비스는 절대 던지지 않습니다)
   * 빈 배열이 돌아오므로, 지금까지처럼 LLM 지식만으로 쓰는 동작으로
   * 조용히 되돌아갑니다.
   */
  private async researchBlock(
    narrator: PhaseNarrator,
    author: AgentEntity,
    task: string,
  ): Promise<string[]> {
    if (author.team !== 'researcher' || !this.webSearch.enabled) return [];

    narrator.tool(author.id, 'web-search', 'started', task.slice(0, 40));
    const results = await this.webSearch.search(task).catch((cause: unknown) => {
      this.logger.warn(`웹 검색 호출이 실패했습니다: ${String(cause)}`);
      return [];
    });
    narrator.tool(
      author.id,
      'web-search',
      'completed',
      results.length > 0 ? `${results.length}건 찾음` : '결과 없음',
    );

    if (results.length === 0) return [];

    return [
      '',
      '## 실시간 검색 결과',
      '아래는 방금 검색한 실제 결과입니다. 여기 담긴 사실은 [추정] 태그 없이 그대로 인용하고,',
      '출처가 되는 URL을 괄호로 함께 적으세요. 검색 결과에 없는 내용만 [추정]으로 표시합니다.',
      ...results.map(
        (r, i) => `${i + 1}. **${r.title}** — ${r.snippet} (${r.url})`,
      ),
    ];
  }

  /** 팀장이 팀원 원고를 부서 하나의 목소리로 합칩니다 */
  private mergeTeamDraft(
    { session }: PhaseContext,
    lead: AgentEntity,
    task: string,
    sections: Array<{ member: AgentEntity; text: string }>,
  ): Promise<string> {
    return this.llm.complete(
      lead.systemPrompt,
      [
        session.sharedContext,
        `\n## ${lead.dept} 에 내려진 지시\n${task}`,
        '',
        '## 팀원들이 올린 원고',
        ...sections.map((s) => `\n### ${s.member.displayName} — ${s.member.specialty}\n${s.text}`),
        '',
        `팀원 원고를 **${lead.dept}의 원고 하나**로 다시 쓰세요.`,
        '- 그대로 이어붙이지 말고 한 사람이 쓴 것처럼 재구성합니다.',
        '- 중복은 제거하고, 팀원 간 어긋나는 주장은 팀장 판단으로 정리합니다.',
        '- 팀원이 놓친 부분이 있으면 직접 채웁니다.',
        '- 팀원 이름을 문장에 노출하지 마세요.',
      ].join('\n'),
      { maxTokens: 3000, signal: session.signal },
      session.usage,
    );
  }
}
