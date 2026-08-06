import { Injectable } from '@nestjs/common';
import type { AgentId, PhaseKey } from '@shared';
import { LlmService } from '../../llm/llm.service';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

interface RawCritique {
  feedback?: Array<{ to?: string; point?: string }>;
}

/** 한 부서가 다른 부서에게 남긴 지적 */
export interface FeedbackNote {
  from: AgentId;
  point: string;
}

/** 부서별 수신함 — 개정 단계로 전달됩니다 */
export type FeedbackInbox = Map<AgentId, FeedbackNote[]>;

/**
 * 3단계 — 교차검토.
 *
 * 이 시스템의 핵심입니다. 각 부서가 동료의 초안을 읽고
 * **자기 전문가 관점에서** 특정 부서를 지목해 지적합니다.
 * 단순 결과 병합과 완성도가 갈리는 지점입니다.
 */
@Injectable()
export class FeedbackPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'feedback';
  readonly label = '부서 간 교차검토';

  constructor(private readonly llm: LlmService) {}

  /** WorkflowService 가 라운드 수를 알려주려고 별도 메서드를 씁니다 */
  async execute(context: PhaseContext): Promise<void> {
    await this.collect(context);
  }

  async collect({ session, agents }: PhaseContext): Promise<FeedbackInbox> {
    const narrator = new PhaseNarrator(session, '교차검토');
    const team = session.team;
    const inbox: FeedbackInbox = new Map(team.map((id) => [id, []]));

    await Promise.all(
      team.map(async (me) => {
        const others = team.filter((o) => o !== me);
        if (others.length === 0) return;

        const entity = agents.findById(me);
        narrator.status(me, 'talking', '동료 검토 중');

        const critique = await this.llm.completeJson<RawCritique>(
          entity.systemPrompt,
          this.buildPrompt(session.sharedContext, me, others, session.drafts, agents),
          { maxTokens: 1500, signal: session.signal },
          session.usage,
        );

        for (const item of critique.feedback ?? []) {
          const target = item.to as AgentId | undefined;
          if (!target || !inbox.has(target) || !item.point) continue;
          inbox.get(target)?.push({ from: me, point: item.point });
          narrator.say(me, item.point, target);
        }

        narrator.status(me, 'idle');
      }),
    );

    return inbox;
  }

  private buildPrompt(
    sharedContext: string,
    me: AgentId,
    others: AgentId[],
    drafts: Map<AgentId, string>,
    agents: PhaseContext['agents'],
  ): string {
    return [
      sharedContext,
      '',
      '## 동료 부서들의 초안',
      ...others.map((o) => {
        const a = agents.findById(o);
        return `\n### ${a.dept} (${a.name})\n${drafts.get(o) ?? ''}`;
      }),
      '',
      '## 당신의 초안',
      drafts.get(me) ?? '',
      '',
      '당신의 **전문가 관점에서** 동료 부서의 초안을 검토하세요.',
      '- 당신 부서 입장에서 봤을 때 위험하거나, 비현실적이거나, 빠진 것을 지적하세요.',
      '- 칭찬은 필요 없습니다. 고쳐야 할 것만 말하세요. 지적할 게 없으면 빈 배열로 두세요.',
      '- 각 지적은 "무엇이 문제인지 + 어떻게 고쳐야 하는지" 를 한 덩어리로 씁니다.',
      '',
      'JSON 스키마:',
      '{ "feedback": [{"to": "부서id", "point": "지적과 개선안 2~3문장"}] }',
      `사용 가능한 부서id: ${others.join(', ')}`,
    ].join('\n');
  }
}
