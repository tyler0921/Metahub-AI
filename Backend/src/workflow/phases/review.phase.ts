import { Injectable } from '@nestjs/common';
import type { DeliverableKind, PhaseKey, ReviewResult } from '@shared';
import { LlmService } from '../../llm/llm.service';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

interface RawReview {
  verdict?: string;
  score?: number;
  strengths?: string[];
  issues?: string[];
  note?: string;
}

/**
 * 6단계 — 검수.
 * 비서실장이 대표 눈높이로 채점하고, 미달이면 반려합니다.
 */
@Injectable()
export class ReviewPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'review';
  readonly label = '비서실장 검수';

  constructor(private readonly llm: LlmService) {}

  async execute(context: PhaseContext): Promise<void> {
    await this.judge(context, '', 0, 0);
  }

  async judge(
    { session, agents }: PhaseContext,
    draft: string,
    attempt: number,
    maxRework: number,
    kind: DeliverableKind = 'document',
  ): Promise<ReviewResult> {
    const narrator = new PhaseNarrator(session, '검수');
    narrator.status('chief', 'thinking', '검수 중');

    const raw = await this.llm.completeJson<RawReview>(
      agents.chief.systemPrompt,
      this.buildPrompt(
        session.brief,
        session.plan.goal,
        session.plan.successCriteria,
        draft,
        attempt >= maxRework,
        kind,
      ),
      { maxTokens: 1500, signal: session.signal },
      session.usage,
    );

    const review = this.normalize(raw, attempt >= maxRework);
    narrator.status('chief', 'idle');
    session.emit({ type: 'review', review, attempt });
    narrator.say(
      'chief',
      `검수 결과 ${review.score}점 — ${review.verdict === 'approve' ? '승인' : '반려'}. ${review.note}`,
    );

    return review;
  }

  private buildPrompt(
    brief: string,
    goal: string,
    criteria: string[],
    draft: string,
    isLastChance: boolean,
    kind: DeliverableKind,
  ): string {
    const isWebsite = kind === 'website';

    return [
      `## 대표 지시\n${brief}`,
      `\n## 목표\n${goal}`,
      `\n## 성공 기준\n${criteria.map((c) => `- ${c}`).join('\n')}`,
      '',
      isWebsite ? '## 개발팀이 만든 파일' : '## 문서팀이 올린 산출물',
      draft,
      '',
      '대표님께 이대로 올려도 되는지 **냉정하게** 검수하세요. 아첨은 금지입니다.',
      isWebsite
        ? [
            '이것은 브라우저에서 실제로 열릴 파일입니다. 코드를 읽고 판단하세요.',
            '',
            '체크 포인트:',
            '- 지시한 내용이 페이지에 실제로 들어 있는가 (기획만 하고 안 넣은 섹션은 없는가)',
            '- Lorem ipsum, "여기에 내용", TODO 같은 자리표시자가 남아 있지 않은가',
            '- HTML 에 없는 클래스를 CSS 가 잡고 있거나, 없는 id 를 JS 가 잡고 있지 않은가',
            '- 외부 CDN·외부 이미지 URL 을 참조해 오프라인에서 깨지지 않는가',
            '- 태그가 제대로 닫혀 있고 문서 구조가 온전한가',
            '- 모바일 화면에서 무너지지 않을 구조인가',
            '',
            '`issues` 에는 "어느 파일의 무엇을 어떻게 고쳐야 하는지" 를 적으세요.',
          ].join('\n')
        : '체크 포인트: 지시를 실제로 이행했는가 / 성공 기준을 충족하는가 / 근거 없는 주장은 없는가 / 대표가 바로 결정할 수 있는가.',
      '',
      'JSON 스키마:',
      '{ "verdict": "approve" | "rework", "score": 0-100, "strengths": ["..."], "issues": ["반드시 고쳐야 할 것"], "note": "대표께 드리는 한 줄 코멘트" }',
      isLastChance
        ? '\n※ 재작업 기회가 남아있지 않으므로 verdict는 approve로 하되, issues에 한계를 솔직히 적으세요.'
        : '',
    ].join('\n');
  }

  private normalize(raw: RawReview, forceApprove: boolean): ReviewResult {
    const verdict: ReviewResult['verdict'] =
      forceApprove || raw.verdict !== 'rework' ? 'approve' : 'rework';

    return {
      verdict,
      score: this.clampScore(raw.score),
      strengths: (raw.strengths ?? []).filter(Boolean),
      issues: (raw.issues ?? []).filter(Boolean),
      note: raw.note?.trim() ?? '',
    };
  }

  private clampScore(score: unknown): number {
    const n = Number(score);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
