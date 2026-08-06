import type {
  CompletionRequest,
  CompletionResult,
  LlmProvider,
} from '../interfaces/llm-provider.interface';

/**
 * API 키 없이 전체 파이프라인을 검증하기 위한 가짜 프로바이더.
 * 실제 네트워크를 타지 않으므로 통합 테스트에도 그대로 씁니다.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock';

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    await this.sleep(120); // 비동기 흐름을 실제와 비슷하게

    return {
      text: this.buildReply(request),
      usage: { inputTokens: 0, outputTokens: 0, calls: 1 },
    };
  }

  private buildReply(request: CompletionRequest): string {
    const speaker = /"(.+?)"/.exec(request.system)?.[1] ?? '에이전트';

    if (request.prefill === '{') {
      return this.buildJsonReply(request.prompt);
    }

    return [
      `## ${speaker}의 검토 결과 (mock)`,
      '',
      '- API 키 없이 파이프라인을 검증하기 위한 가짜 응답입니다.',
      '- 실제 응답을 보려면 `Backend/.env` 에 `ANTHROPIC_API_KEY` 를 넣으세요.',
      '',
      '### 핵심 포인트',
      '1. [mock] 첫 번째 제안',
      '2. [mock] 두 번째 제안',
      '3. [mock] 세 번째 제안',
      '',
      '### 리스크',
      '- [mock] 예상되는 위험 요소',
    ].join('\n');
  }

  private buildJsonReply(prompt: string): string {
    // 업무 분해 요청
    if (prompt.includes('assignments')) {
      return JSON.stringify({
        goal: '[mock] 대표 지시를 달성하기 위한 목표',
        successCriteria: ['[mock] 성공 기준 1', '[mock] 성공 기준 2'],
        deliverable: '보고서',
        assignments: [
          { agent: 'researcher', task: '[mock] 시장 현황과 경쟁사를 조사할 것' },
          { agent: 'planner', task: '[mock] 실행 로드맵을 수립할 것' },
          { agent: 'marketer', task: '[mock] 포지셔닝과 채널 전략을 제안할 것' },
        ],
      });
    }

    // 검수 요청
    if (prompt.includes('verdict')) {
      return JSON.stringify({
        verdict: 'approve',
        score: 86,
        strengths: ['[mock] 구조가 명확함'],
        issues: [],
        note: '[mock] 대표 보고 가능 수준.',
      });
    }

    // 교차검토 요청
    if (prompt.includes('feedback')) {
      return JSON.stringify({
        feedback: [
          { to: 'planner', point: '[mock] 일정이 낙관적입니다. 버퍼를 넣으세요.' },
        ],
      });
    }

    return JSON.stringify({ ok: true });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
