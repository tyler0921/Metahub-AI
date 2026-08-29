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
      session.plan.kind === 'slides'
        ? this.slidesInstructions(session.plan.deliverable)
        : this.documentInstructions(session.plan.deliverable),
      '',
      '부서 이름을 문장에 노출하지 마세요. 한 사람이 쓴 것처럼 읽혀야 합니다.',
    ].join('\n');
  }

  private documentInstructions(deliverable: string): string {
    return [
      `위 자료를 "${deliverable}" 형태의 **하나의 완성된 문서**로 다시 쓰세요.`,
      '',
      '필수 구조:',
      '1. `## 핵심 요약` — 대표가 30초 안에 읽을 3~5줄',
      '2. 본문 — 논리 순서대로 재배열 (부서 순서가 아니라 읽는 사람 기준)',
      '3. `## 실행 계획` — 무엇을 / 누가 / 언제까지, 표로',
      '4. `## 쟁점` — 부서 간 의견이 갈린 지점 (없으면 생략)',
      '5. `## 대표님 결정 필요 사항` — 답을 기다리는 질문 목록',
    ].join('\n');
  }

  /**
   * Marp(https://marp.app) 호환 마크다운 — `---` 로 슬라이드를 나눕니다.
   * 별도 렌더러 없이도 이 앱의 마크다운 뷰어에서 구분선 있는 문서로 읽히고,
   * Marp 로 열면 그대로 슬라이드가 됩니다.
   */
  private slidesInstructions(deliverable: string): string {
    return [
      `위 자료를 "${deliverable}" 로 다시 쓰세요. 문서가 아니라 **발표 슬라이드**입니다.`,
      '',
      '형식 — Marp 호환 마크다운:',
      '- 맨 앞에 프론트매터를 넣습니다: `---\\nmarp: true\\npaginate: true\\n---`',
      '- 슬라이드마다 `---` 한 줄로 구분합니다.',
      '- 슬라이드 하나에는 제목(`#`/`##`) 하나 + 불릿 5개 이내. 문단을 통째로 넣지 않습니다.',
      '- 첫 슬라이드는 제목 슬라이드(제목 + 한 줄 부제), 마지막 슬라이드는 "대표님 결정 필요 사항"입니다.',
      '- 발표자가 그 자리에서 읽을 대사가 아니라, 화면에 그대로 뜨는 **문구**를 씁니다. 길게 쓰지 말고 압축하세요.',
      '- 표·비교가 필요하면 마크다운 표를 씁니다.',
      '- 슬라이드 개수는 8~14장 사이로 맞춥니다.',
    ].join('\n');
  }
}
