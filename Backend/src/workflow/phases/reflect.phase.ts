import { Injectable, Logger } from '@nestjs/common';
import type { PhaseKey, ReviewResult } from '@shared';
import { LlmService } from '../../llm/llm.service';
import { VaultService } from '../../vault/vault.service';
import type { VaultProjectEntity } from '../../vault/entities/vault-project.entity';
import type { PhaseContext, WorkflowPhase } from './workflow-phase.interface';

interface RawLessons {
  lessons?: string[];
}

/** 한 세션에서 부서 하나가 남길 수 있는 항목 수 */
const MAX_LESSONS = 2;

/**
 * 마지막 단계 — 회고.
 *
 * 세션이 끝난 뒤 각 부서가 **이번에 배운 것**을 한두 줄로 압축해
 * 부서 지식 노트에 누적합니다.
 *
 * 왜 필요한가: 지금까지는 매 세션이 원본 노트(회의록·산출물)에서 처음부터
 * 다시 유추했습니다. 회사가 100번 일해도 101번째가 더 똑똑해지지 않았습니다.
 * 요약을 따로 쌓아 두면 회상이 긴 원문 대신 이 노트를 먼저 물어옵니다.
 *
 * 비용은 부서당 LLM 호출 1회입니다. 로컬 모델에서 부담되면
 * `WORKFLOW_REFLECT=false` 로 끌 수 있습니다.
 */
@Injectable()
export class ReflectPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'reflect';
  readonly label = '부서 지식 정리';

  private readonly logger = new Logger(ReflectPhase.name);

  constructor(
    private readonly llm: LlmService,
    private readonly vault: VaultService,
  ) {}

  execute(): Promise<void> {
    return Promise.reject(
      new Error('ReflectPhase 는 run() 으로 호출하세요 (프로젝트 폴더가 필요합니다).'),
    );
  }

  async run(
    context: PhaseContext,
    project: VaultProjectEntity,
    verdict: ReviewResult | null,
  ): Promise<void> {
    const { session, agents } = context;

    /*
     * 회고는 **실패해도 세션을 망치지 않아야 합니다.**
     * 산출물은 이미 완성돼 저장을 기다리는 중이고,
     * 교훈 한 줄을 못 뽑았다고 대표에게 오류를 보여줄 이유가 없습니다.
     */
    await Promise.all(
      session.team.map(async (agentId) => {
        // 회고는 산출물 저장보다 먼저 돌기 때문에, 여기서 새는 예외가 하나라도
        // 있으면 다 끝난 결과물을 통째로 잃습니다. 부서 단위로 전부 삼킵니다.
        try {
          const agent = agents.findById(agentId);
          const draft = session.drafts.get(agentId);
          if (!draft) return;

          const raw = await this.llm.completeJson<RawLessons>(
            agent.systemPrompt,
            this.buildPrompt(session.brief, draft, verdict),
            { maxTokens: 600, temperature: 0.3, signal: session.signal },
            session.usage,
          );

          const lessons = (raw.lessons ?? [])
            .filter((l): l is string => typeof l === 'string' && l.trim().length > 8)
            .map((l) => l.trim())
            .slice(0, MAX_LESSONS);

          await this.vault.appendDepartmentKnowledge(agent.dept, lessons, project);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`${agentId} 부서 회고를 건너뜁니다: ${message}`);
        }
      }),
    );
  }

  private buildPrompt(
    brief: string,
    draft: string,
    verdict: ReviewResult | null,
  ): string {
    return [
      '## 이번 대표 지시',
      brief,
      '',
      '## 당신 부서가 낸 결과물',
      draft.slice(0, 4000),
      ...(verdict?.issues.length
        ? ['', '## 검수에서 지적받은 것', ...verdict.issues.map((i) => `- ${i}`)]
        : []),
      '',
      '이번 일에서 **다음에도 쓸 수 있는 교훈**만 남기세요.',
      '',
      '규칙:',
      '- 이번 프로젝트에만 해당하는 사실(특정 고객명·특정 수치)은 쓰지 마세요.',
      '- 다음에 비슷한 일이 왔을 때 판단을 바꿀 만한 것만 씁니다.',
      `- 최대 ${MAX_LESSONS}개. 남길 게 없으면 빈 배열로 두세요. 억지로 채우지 마세요.`,
      '- 한 줄에 한 문장. 40자 안팎으로 짧게.',
      '',
      'JSON 스키마:',
      '{ "lessons": ["다음에도 통할 판단 기준 한 문장", "..."] }',
    ].join('\n');
  }
}
