import { Injectable } from '@nestjs/common';
import type { PhaseKey } from '@shared';
import { LlmService } from '../../llm/llm.service';
import type { FeedbackInbox } from './feedback.phase';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

/**
 * 4단계 — 개정.
 *
 * 받은 지적을 반영해 초안을 고칩니다.
 * 동의하지 않는 지적은 반영하지 않고 "## 반론" 절에 이유를 남기게 해서,
 * 부서의 전문성이 다수결에 눌리지 않도록 합니다.
 */
@Injectable()
export class RevisePhase implements WorkflowPhase {
  readonly key: PhaseKey = 'revise';
  readonly label = '피드백 반영 개정';

  constructor(private readonly llm: LlmService) {}

  async execute(context: PhaseContext): Promise<void> {
    await this.apply(context, new Map());
  }

  async apply(
    { session, agents }: PhaseContext,
    inbox: FeedbackInbox,
  ): Promise<void> {
    const narrator = new PhaseNarrator(session, '개정');

    await Promise.all(
      session.team.map(async (me) => {
        const received = inbox.get(me) ?? [];
        if (received.length === 0) {
          narrator.status(me, 'done', '수정 사항 없음');
          return;
        }

        const entity = agents.findById(me);
        narrator.status(me, 'thinking', `피드백 ${received.length}건 반영 중`);

        const revised = await this.llm.complete(
          entity.systemPrompt,
          [
            session.sharedContext,
            '',
            '## 당신의 초안',
            session.drafts.get(me) ?? '',
            '',
            '## 동료 부서에서 받은 지적',
            ...received.map(
              (r) => `- **${agents.findById(r.from).dept}**: ${r.point}`,
            ),
            '',
            '지적을 검토해 초안을 개정하세요.',
            '- 타당한 지적은 반영합니다.',
            '- 동의하지 않는 지적은 반영하지 말고, 문서 맨 끝 "## 반론" 절에 이유를 적으세요.',
            '- 개정된 **전체 문서**를 출력하세요. 변경점 요약만 쓰지 마세요.',
          ].join('\n'),
          { maxTokens: 3500, signal: session.signal },
          session.usage,
        );

        session.drafts.set(me, revised);
        narrator.status(me, 'done', '개정 완료');
        narrator.say(me, revised, 'chief');
      }),
    );
  }
}
