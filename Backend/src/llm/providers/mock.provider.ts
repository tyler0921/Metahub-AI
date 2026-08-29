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

    // 코드형 산출물 — 실제로 열리는 페이지가 나와야 미리보기를 검증할 수 있습니다
    const buildTarget = /## 지금 만들 파일 — `(.+?)`/.exec(request.prompt)?.[1];
    if (buildTarget) return this.buildFileReply(buildTarget);

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
      // 실제 종류 판정은 KickoffPhase 가 지시문 규칙으로 한 번 더 거릅니다
      const isWebsite = /랜딩|웹페이지|웹사이트|홈페이지|website/i.test(prompt);

      return JSON.stringify({
        goal: '[mock] 대표 지시를 달성하기 위한 목표',
        kind: isWebsite ? 'website' : 'document',
        successCriteria: ['[mock] 성공 기준 1', '[mock] 성공 기준 2'],
        deliverable: isWebsite ? '랜딩페이지' : '보고서',
        assignments: isWebsite
          ? [
              { agent: 'planner', task: '[mock] 페이지 섹션 구성을 정할 것' },
              { agent: 'marketer', task: '[mock] 실제 들어갈 카피를 쓸 것' },
              { agent: 'dev', task: '[mock] 순수 HTML/CSS 로 구현할 것' },
            ]
          : [
              { agent: 'researcher', task: '[mock] 시장 현황과 경쟁사를 조사할 것' },
              { agent: 'planner', task: '[mock] 실행 로드맵을 수립할 것' },
              { agent: 'marketer', task: '[mock] 포지셔닝과 채널 전략을 제안할 것' },
            ],
      });
    }

    // 빌드 파일 목록 요청
    if (prompt.includes('"files"')) {
      return JSON.stringify({
        files: [
          { path: 'index.html', purpose: '[mock] 페이지 구조와 콘텐츠' },
          { path: 'style.css', purpose: '[mock] 레이아웃과 색상' },
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

  /** 코드형 산출물의 가짜 파일 — 실제로 브라우저에서 열립니다 */
  private buildFileReply(filePath: string): string {
    if (filePath.endsWith('.css')) {
      return [
        '```css',
        ':root { --ink: #16202e; --dim: #5b6b7f; --accent: #3f6ae0; }',
        '* { box-sizing: border-box; }',
        'body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); }',
        '.hero { padding: 96px 24px; text-align: center; background: linear-gradient(160deg, #eef3ff, #fff); }',
        '.hero h1 { margin: 0 0 12px; font-size: 40px; }',
        '.hero p { margin: 0; color: var(--dim); }',
        '.cta { display: inline-block; margin-top: 24px; padding: 12px 28px; border-radius: 8px; background: var(--accent); color: #fff; text-decoration: none; }',
        '@media (max-width: 600px) { .hero { padding: 56px 18px; } .hero h1 { font-size: 28px; } }',
        '```',
      ].join('\n');
    }

    return [
      '```html',
      '<!DOCTYPE html>',
      '<html lang="ko">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>mock 랜딩페이지</title>',
      '  <link rel="stylesheet" href="style.css">',
      '</head>',
      '<body>',
      '  <main class="hero">',
      '    <h1>mock 랜딩페이지</h1>',
      '    <p>API 키 없이 파이프라인을 검증하기 위한 가짜 산출물입니다.</p>',
      '    <a class="cta" href="#">시작하기</a>',
      '  </main>',
      '</body>',
      '</html>',
      '```',
    ].join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
