import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { AgentId } from '@shared';
import { formatLocalDateTimeLabel } from '../common/utils/date.util';
import { LlmService } from '../llm/llm.service';
import { AgentsService } from './agents.service';

interface AmbientDialogue {
  firstLine: string;
  secondLine: string;
}

interface RawAmbientDialogue {
  firstLine?: unknown;
  secondLine?: unknown;
}

@Injectable()
export class AmbientChatService {
  private readonly logger = new Logger(AmbientChatService.name);

  constructor(
    private readonly agents: AgentsService,
    private readonly llm: LlmService,
  ) {}

  /** 오피스 휴게 중 두 직원의 짧은 스몰토크를 LLM 으로 생성합니다. */
  async generate(agentA: AgentId, agentB: AgentId): Promise<AmbientDialogue> {
    if (agentA === agentB) {
      throw new BadRequestException('같은 직원끼리는 대화를 만들 수 없습니다.');
    }

    const a = this.agents.findById(agentA);
    const b = this.agents.findById(agentB);
    const sameTeam = a.team === b.team;
    const nowLabel = formatLocalDateTimeLabel();

    const system = [
      '당신은 AI 회사 오피스에서 직원들의 자연스러운 휴게 대화를 짧게 써 주는 작가입니다.',
      '두 사람은 카페나 라운지에서 잠깐 마주쳐 가벼운 스몰토크를 나눕니다.',
      '업무 지시나 보고서 톤이 아니라, 동료끼리의 편안한 말투로 씁니다.',
    ].join('\n');

    const prompt = [
      '## 상황',
      `- 현재: ${nowLabel}`,
      '- 장소: 회사 오피스 카페/라운지',
      '- 두 사람은 잠깐 쉬는 중이며, 곧 다시 자리로 돌아갑니다.',
      sameTeam
        ? '- 같은 부서 동료입니다.'
        : '- 서로 다른 부서 동료입니다. 업무 맥락을 가볍게 섞어도 좋습니다.',
      '',
      '## A (먼저 말 걸기)',
      `- ${a.displayName} (${a.dept})`,
      `- 전문: ${a.specialty}`,
      '',
      '## B (대답)',
      `- ${b.displayName} (${b.dept})`,
      `- 전문: ${b.specialty}`,
      '',
      '## 규칙',
      '- firstLine: A 가 건네는 한 문장 (25~45자, 존댓말)',
      '- secondLine: B 가 이어 받는 한 문장 (25~45자, 존댓말)',
      '- 이름·직함을 대사에 넣지 마세요. 서로 마주 보고 있는 상황입니다.',
      '- 점심, 커피, 날씨, 주말, 최근 업무, 회사 분위기 등 상황에 맞게 **매번 다르게** 생각해 쓰세요.',
      '- 정해진 템플릿이나 뻔한 인사말만 반복하지 마세요.',
      '- JSON만 출력: {"firstLine":"...","secondLine":"..."}',
    ].join('\n');

    try {
      const raw = await this.llm.completeJson<RawAmbientDialogue>(system, prompt, {
        temperature: 0.85,
        maxTokens: 220,
      });
      return this.normalize(raw);
    } catch (error) {
      this.logger.warn(`휴게 대화 생성 실패 (${agentA} ↔ ${agentB}): ${String(error)}`);
      throw error;
    }
  }

  private normalize(raw: RawAmbientDialogue): AmbientDialogue {
    const firstLine = this.cleanLine(raw.firstLine);
    const secondLine = this.cleanLine(raw.secondLine);
    if (!firstLine || !secondLine) {
      throw new Error('LLM 이 유효한 대화 줄을 반환하지 않았습니다.');
    }
    return { firstLine, secondLine };
  }

  private cleanLine(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const line = value.replace(/\s+/g, ' ').trim();
    if (line.length < 4 || line.length > 80) return null;
    return line;
  }
}
