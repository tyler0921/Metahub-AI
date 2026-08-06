import { Injectable } from '@nestjs/common';
import type { PhaseKey, ReviewResult } from '@shared';
import { LlmService } from '../../llm/llm.service';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

export interface IntegrateOptions {
  /** 재작업 회차 (0 = 최초 통합) */
  attempt: number;
  /** 직전 통합본 — 재작업 시 참고용 */
  previousDraft: string;
  /** 반려 사유 */
  rejection: ReviewResult | null;
}

/**
 * 5단계 — 통합.
 * 문서팀장이 부서 원고들을 "한 사람이 쓴 것처럼" 다시 씁니다.
 */
@Injectable()
export class IntegratePhase implements WorkflowPhase {
  readonly key: PhaseKey = 'integrate';
  readonly label = '문서팀 최종 통합';

  constructor(private readonly llm: LlmService) {}

  async execute(context: PhaseContext): Promise<void> {
    await this.merge(context, { attempt: 0, previousDraft: '', rejection: null });
  }

  async merge(
    { session, agents }: PhaseContext,
    options: IntegrateOptions,
  ): Promise<string> {
    const narrator = new PhaseNarrator(session, '통합');
    const writer = agents.writer;

    narrator.status('writer', 'thinking', options.attempt === 0 ? '통합 중' : '재작업 중');

    const merged = await this.llm.complete(
      writer.systemPrompt,
      this.buildPrompt({ session, agents, recallContext: '' }, options),
      { maxTokens: 6000, signal: session.signal },
      session.usage,
    );

    narrator.status('writer', 'done', '통합 완료');
    narrator.say('writer', merged, 'chief');
    return merged;
  }

  private buildPrompt(
    { session, agents }: PhaseContext,
    options: IntegrateOptions,
  ): string {
    const departmentDrafts = session.team.map((id) => {
      const a = agents.findById(id);
      return `\n### ${a.dept} (${a.displayName})\n${session.drafts.get(id) ?? ''}`;
    });

    const reworkBlock =
      options.attempt > 0 && options.rejection
        ? [
            '',
            '## ⚠️ 비서실장 반려 사유 — 반드시 해결할 것',
            ...options.rejection.issues.map((i) => `- ${i}`),
            options.rejection.note,
            '',
            '## 직전 원고',
            options.previousDraft,
          ].join('\n')
        : '';

    return [
      session.sharedContext,
      '',
      '## 각 부서 최종 원고',
      ...departmentDrafts,
      reworkBlock,
      '',
      `위 자료를 "${session.plan.deliverable}" 형태의 **하나의 완성된 문서**로 다시 쓰세요.`,
      '',
      '필수 구조:',
      '1. `## 핵심 요약` — 대표가 30초 안에 읽을 3~5줄',
      '2. 본문 — 논리 순서대로 재배열 (부서 순서가 아니라 읽는 사람 기준)',
      '3. `## 실행 계획` — 무엇을 / 누가 / 언제까지, 표로',
      '4. `## 쟁점` — 부서 간 의견이 갈린 지점 (없으면 생략)',
      '5. `## 대표님 결정 필요 사항` — 답을 기다리는 질문 목록',
      '',
      '부서 이름을 문장에 노출하지 마세요. 한 사람이 쓴 것처럼 읽혀야 합니다.',
    ].join('\n');
  }
}
