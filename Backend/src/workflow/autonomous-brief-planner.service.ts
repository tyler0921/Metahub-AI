import { Injectable, Logger } from '@nestjs/common';
import type { SessionSummary } from '@shared';
import { AgentsService } from '../agents/agents.service';
import { LlmService } from '../llm/llm.service';
import { chooseAutonomousBrief } from './autonomous-work.service';
import { SessionRepository } from './repositories/session.repository';

const RECENT_SESSIONS_LIMIT = 8;
const MIN_BRIEF_LENGTH = 20;
const MAX_BRIEF_LENGTH = 400;
const PREFIX = '[자율 업무] ';

interface RawBrief {
  brief?: string;
}

/**
 * 다음 자율 업무를 스스로 고른다.
 *
 * 고정 문장 3개를 순환하던 것과 다르게, 최근 세션 이력을 비서실장 페르소나에게
 * 보여주고 다음에 손댈 만한 구체적 과제를 즉석에서 짓게 합니다.
 *
 * 이 서비스가 실패해도(LLM 오류, 예산 소진, 이상한 응답) 자율 스케줄이 멈추면
 * 안 되므로, `chooseAutonomousBrief` 정적 순환으로 무조건 안전하게 되돌아갑니다.
 * 호출부(`AutonomousWorkService`)는 이 폴백을 신경 쓸 필요가 없습니다.
 */
@Injectable()
export class AutonomousBriefPlannerService {
  private readonly logger = new Logger(AutonomousBriefPlannerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly sessions: SessionRepository,
    private readonly agents: AgentsService,
  ) {}

  async plan(recentBriefs: readonly string[]): Promise<string> {
    try {
      const brief = await this.attempt(recentBriefs);
      if (brief) return brief;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`자율 과제 제안에 실패해 고정 순환으로 대체합니다: ${message}`);
    }
    return chooseAutonomousBrief(recentBriefs);
  }

  private async attempt(recentBriefs: readonly string[]): Promise<string | null> {
    const raw = await this.llm.completeJson<RawBrief>(
      this.agents.chief.systemPrompt,
      this.buildPrompt(recentBriefs),
      { maxTokens: 400, temperature: 0.6 },
    );

    const candidate = raw.brief?.trim();
    if (!candidate) return null;

    const prefixed = candidate.startsWith(PREFIX) ? candidate : `${PREFIX}${candidate}`;
    if (prefixed.length < MIN_BRIEF_LENGTH || prefixed.length > MAX_BRIEF_LENGTH) return null;
    // 최근에 낸 과제를 토씨 하나 안 바꾸고 그대로 되풀이하면 의미가 없습니다
    if (recentBriefs.includes(prefixed)) return null;

    return prefixed;
  }

  private buildPrompt(recentBriefs: readonly string[]): string {
    const history = this.sessions.findRecentSummaries(RECENT_SESSIONS_LIMIT);

    return [
      '지금은 대표님의 별도 지시 없이, 회사가 스스로 다음 업무를 정해야 하는 자율 업무 시간입니다.',
      '',
      '## 최근 업무 이력',
      history.length > 0 ? this.describeHistory(history) : '(아직 기록이 없습니다 — 첫 자율 업무입니다)',
      '',
      '## 최근에 이미 낸 자율 과제 (반복하지 마세요)',
      recentBriefs.length > 0
        ? recentBriefs.map((b) => `- ${b}`).join('\n')
        : '(없음)',
      '',
      '위 이력을 보고, 회사 운영 품질이나 사용자 가치를 가장 크게 높일 수 있는',
      '다음 자율 업무 하나를 직접 정하세요.',
      '',
      '- 이미 끝난 것과 같은 일을 반복하지 마세요.',
      '- 실패했거나 검수에서 지적받은 게 있다면 그걸 보완하는 과제를 우선하세요.',
      '- 막연한 지시("~를 검토해줘") 대신, 무엇을 만들거나 어떤 결정을 내려야 하는지',
      '  구체적으로 쓰세요. 이 문장이 그대로 착수 단계의 지시문이 됩니다.',
      '',
      '다음 스키마의 JSON으로만 답하세요:',
      '{ "brief": "1문단짜리 구체적인 업무 지시" }',
    ].join('\n');
  }

  private describeHistory(history: SessionSummary[]): string {
    return history
      .map((s) => {
        const score = s.score !== null ? `${s.score}점` : '점수 없음';
        return `- [${s.status}, ${score}] ${s.brief}`;
      })
      .join('\n');
  }
}
