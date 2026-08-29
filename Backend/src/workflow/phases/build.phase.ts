import { Injectable, Logger } from '@nestjs/common';
import type { ArtifactFile, PhaseKey, ReviewResult } from '@shared';
import { LlmService } from '../../llm/llm.service';
import { WorkspaceService, MAX_FILES } from '../../workspace/workspace.service';
import type { WorkspaceProjectEntity } from '../../workspace/entities/workspace-project.entity';
import {
  PhaseNarrator,
  type PhaseContext,
  type WorkflowPhase,
} from './workflow-phase.interface';

export interface BuildOptions {
  /** 코드형 산출물이 쌓일 폴더 */
  project: WorkspaceProjectEntity;
  /** 재작업 회차 (0 = 최초 빌드) */
  attempt: number;
  /** 직전 빌드 결과 — 재작업 시 참고용 */
  previousFiles: ArtifactFile[];
  /** 반려 사유 */
  rejection: ReviewResult | null;
}

export interface BuildResult {
  files: ArtifactFile[];
  previewUrl: string;
}

/** LLM 이 돌려주는 파일 목록 */
interface RawManifest {
  files?: Array<{ path?: string; purpose?: string }>;
}

interface PlannedFile {
  path: string;
  purpose: string;
}

/**
 * 파일이 만들어지는 순서.
 *
 * HTML 을 먼저 확정해야 CSS 가 실제로 존재하는 클래스명을 물고,
 * JS 가 실제로 존재하는 id 를 잡습니다. 순서를 섞으면 소형 모델은
 * 거의 항상 존재하지 않는 선택자를 지어냅니다.
 */
const BUILD_ORDER = ['.html', '.css', '.js', '.json', '.svg', '.txt', '.md'];

/** 매니페스트가 통째로 망가졌을 때 쓰는 최소 구성 */
const FALLBACK_MANIFEST: PlannedFile[] = [
  { path: 'index.html', purpose: '페이지 전체 구조와 모든 텍스트 콘텐츠' },
  { path: 'style.css', purpose: '레이아웃·타이포그래피·색상·반응형' },
];

/**
 * 5단계(코드형) — 빌드.
 *
 * 문서형의 `IntegratePhase` 자리에 들어갑니다. 문서팀이 원고를 합치는 대신
 * **개발팀장이 실제로 돌아가는 파일을 만들어 디스크에 씁니다.**
 *
 * 설계에서 가장 중요한 두 가지:
 *
 * 1. **코드를 JSON 에 넣지 않습니다.** `{"content": "<div class=\"a\">"}` 처럼
 *    HTML 을 JSON 문자열로 이스케이프하는 건 8B 급 로컬 모델이 거의 실패합니다.
 *    파일 목록(작은 JSON)과 파일 내용(코드펜스)을 분리해서 받습니다.
 *
 * 2. **파일 하나에 호출 하나.** 한 번에 다 만들라고 하면 num_predict 에 걸려
 *    잘리거나, 뒤로 갈수록 품질이 무너집니다. 대신 앞서 만든 파일을
 *    다음 호출의 컨텍스트로 넣어 서로 어긋나지 않게 합니다.
 */
@Injectable()
export class BuildPhase implements WorkflowPhase {
  readonly key: PhaseKey = 'build';
  readonly label = '개발팀 구현';

  private readonly logger = new Logger(BuildPhase.name);

  constructor(
    private readonly llm: LlmService,
    private readonly workspace: WorkspaceService,
  ) {}

  /**
   * 다른 Phase 와 달리 저장 폴더가 필요해서 `build()` 를 씁니다.
   * 계약을 맞추려고 남겨둔 자리입니다.
   */
  execute(): Promise<void> {
    return Promise.reject(
      new Error('BuildPhase 는 build() 로 호출하세요 (프로젝트 폴더가 필요합니다).'),
    );
  }

  async build(context: PhaseContext, options: BuildOptions): Promise<BuildResult> {
    const { session } = context;
    const narrator = new PhaseNarrator(session, '구현');

    narrator.status(
      'dev',
      'thinking',
      options.attempt === 0 ? '파일 구성 설계 중' : '반려 사항 반영 중',
    );

    const manifest = await this.planFiles(context, options);
    narrator.say(
      'dev',
      `${manifest.map((f) => f.path).join(', ')} 를 만들겠습니다.`,
      'chief',
      '구현',
    );

    const files: ArtifactFile[] = [];

    for (const planned of manifest) {
      narrator.status('dev', 'thinking', `${planned.path} 작성 중`);
      narrator.tool('dev', 'file-write', 'started', planned.path);

      const code = await this.writeFile(context, options, planned, files);
      const artifact = await this.workspace.writeArtifact(
        options.project,
        planned.path,
        code,
      );
      files.push(artifact);

      narrator.tool('dev', 'file-write', 'completed', planned.path);
      session.emit({
        type: 'artifact',
        file: {
          path: artifact.path,
          language: artifact.language,
          bytes: artifact.bytes,
        },
        previewUrl: this.workspace.previewUrl(options.project),
      });
    }

    narrator.status('dev', 'done', '구현 완료');
    narrator.say(
      'dev',
      `${files.length}개 파일을 만들었습니다. 총 ${files.reduce((sum, f) => sum + f.bytes, 0).toLocaleString()}바이트입니다.`,
      'chief',
    );

    return { files, previewUrl: this.workspace.previewUrl(options.project) };
  }

  /* ── 1) 무슨 파일을 만들지 정한다 ─────────────── */

  private async planFiles(
    { session, agents }: PhaseContext,
    options: BuildOptions,
  ): Promise<PlannedFile[]> {
    /*
     * 재작업이면 파일 구성을 다시 묻지 않습니다.
     * 반려는 "내용이 부족하다"는 뜻이지 "파일을 다시 나누라"는 뜻이 아니고,
     * 여기서 구성이 바뀌면 이전 파일이 고아로 남아 미리보기가 깨집니다.
     */
    if (options.attempt > 0 && options.previousFiles.length > 0) {
      return options.previousFiles.map((f) => ({
        path: f.path,
        purpose: '반려 사항을 반영해 다시 작성',
      }));
    }

    const dev = agents.findById('dev');

    const raw = await this.llm.completeJson<RawManifest>(
      dev.systemPrompt,
      [
        session.sharedContext,
        '',
        '## 각 부서가 올린 재료',
        ...this.departmentMaterials({ session, agents, recallContext: '' }),
        '',
        '이 페이지를 만들기 위해 **어떤 파일이 필요한지**만 정하세요. 코드는 아직 쓰지 마세요.',
        '',
        '규칙:',
        '- `index.html` 은 반드시 포함합니다.',
        `- 파일은 최대 ${MAX_FILES}개까지입니다. 적을수록 좋습니다.`,
        '- 확장자는 .html / .css / .js 만 씁니다.',
        '- 빌드 도구가 없으므로 React·Vue·Tailwind 같은 것을 쓰지 마세요. 순수 HTML/CSS/JS 입니다.',
        '- 외부 이미지 파일을 참조하지 마세요. 필요하면 CSS 그라디언트나 인라인 SVG 로 대신합니다.',
        '',
        'JSON 스키마:',
        '{ "files": [{"path": "index.html", "purpose": "이 파일이 담당하는 것 한 문장"}] }',
      ].join('\n'),
      { maxTokens: 800, signal: session.signal },
      session.usage,
    );

    return this.normalizeManifest(raw);
  }

  /**
   * LLM 이 준 파일 목록을 실제로 만들어도 되는 것만 남긴다.
   *
   * 경로 검증은 WorkspaceService 에 맡기고, 여기서는 "빌드가 성립하는가"
   * (index.html 이 있는가, 순서가 맞는가) 만 봅니다.
   */
  private normalizeManifest(raw: RawManifest): PlannedFile[] {
    const seen = new Set<string>();
    const files: PlannedFile[] = [];

    for (const item of raw.files ?? []) {
      const filePath = item.path?.trim();
      if (!filePath) continue;

      const reason = this.workspace.rejectReason(filePath);
      if (reason) {
        this.logger.warn(`파일 제외 — ${reason}`);
        continue;
      }

      const key = filePath.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      files.push({ path: filePath, purpose: item.purpose?.trim() || '' });
      if (files.length >= MAX_FILES) break;
    }

    if (!seen.has('index.html')) {
      files.unshift(FALLBACK_MANIFEST[0]);
    }
    if (files.length === 0) return FALLBACK_MANIFEST;

    return files.sort(
      (a, b) => this.orderOf(a.path) - this.orderOf(b.path),
    );
  }

  private orderOf(filePath: string): number {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const index = BUILD_ORDER.indexOf(ext);
    return index === -1 ? BUILD_ORDER.length : index;
  }

  /* ── 2) 파일 하나를 실제로 쓴다 ───────────────── */

  private async writeFile(
    context: PhaseContext,
    options: BuildOptions,
    planned: PlannedFile,
    written: ArtifactFile[],
  ): Promise<string> {
    const { session, agents } = context;
    const dev = agents.findById('dev');
    const isHtml = planned.path.toLowerCase().endsWith('.html');

    const raw = await this.llm.complete(
      dev.systemPrompt,
      [
        session.sharedContext,
        '',
        // HTML 을 쓸 때만 부서 재료 전체가 필요합니다. CSS·JS 단계에서는
        // 이미 확정된 HTML 이 유일한 진실이라 재료를 다시 넣으면
        // 소형 모델이 HTML 에 없는 요소를 꾸며내기 시작합니다.
        ...(isHtml
          ? ['## 각 부서가 올린 재료', ...this.departmentMaterials(context)]
          : []),
        ...this.writtenFilesBlock(written),
        ...this.reworkBlock(options, written),
        '',
        `## 지금 만들 파일 — \`${planned.path}\``,
        planned.purpose,
        '',
        ...this.rulesFor(planned.path, options),
        '',
        `출력은 \`${planned.path}\` 의 **전체 내용**입니다.`,
        '설명·머리말·후기를 붙이지 말고, 아래 형식 그대로 코드블록 하나만 출력하세요.',
        '',
        '```' + this.fenceLanguage(planned.path),
        '(여기에 파일 내용 전체)',
        '```',
      ].join('\n'),
      { maxTokens: isHtml ? 6000 : 3500, signal: session.signal },
      session.usage,
    );

    return this.extractCode(raw, planned.path);
  }

  private rulesFor(filePath: string, options: BuildOptions): string[] {
    const lower = filePath.toLowerCase();

    if (lower.endsWith('.html')) {
      return [
        '규칙:',
        '- `<!DOCTYPE html>` 부터 `</html>` 까지 완전한 문서를 씁니다.',
        '- `<html lang="ko">` 와 `<meta charset="utf-8">`, 뷰포트 메타를 반드시 넣습니다.',
        '- CSS 는 별도 파일이면 `<link rel="stylesheet" href="style.css">` 로 연결합니다.',
        '- 텍스트는 각 부서가 확정한 카피를 **그대로** 씁니다. 새로 지어내지 마세요.',
        '- Lorem ipsum, "여기에 내용", TODO 같은 자리표시자를 남기지 마세요. 전부 실제 내용으로 채웁니다.',
        '- 외부 CDN·외부 이미지 URL 을 쓰지 마세요. 인터넷 없이 열려야 합니다.',
        '- 아이콘·일러스트가 필요하면 인라인 `<svg>` 로 직접 그립니다.',
        '- 시맨틱 태그(header/nav/section/footer)와 접근 가능한 대비를 지킵니다.',
      ];
    }

    if (lower.endsWith('.css')) {
      return [
        '규칙:',
        '- **위 HTML 에 실제로 존재하는 선택자만** 사용합니다. 없는 클래스를 지어내지 마세요.',
        '- 색상·간격은 `:root` 의 CSS 변수로 정의하고 재사용합니다.',
        '- 모바일에서도 깨지지 않게 최소 한 개의 미디어 쿼리를 넣습니다.',
        '- 외부 폰트를 import 하지 말고 시스템 폰트 스택을 씁니다.',
        '- 여백과 정렬을 실제로 잡으세요. 기본 스타일만 얹으면 안 됩니다.',
      ];
    }

    if (lower.endsWith('.js')) {
      return [
        '규칙:',
        '- **위 HTML 에 실제로 존재하는 id·클래스만** 참조합니다.',
        '- 프레임워크·번들러 없이 브라우저에서 바로 도는 순수 JS 로 씁니다.',
        '- `DOMContentLoaded` 안에서 시작하고, 요소가 없을 때를 대비해 null 검사를 넣습니다.',
        '- 꼭 필요한 동작만 넣으세요. 없어도 페이지가 읽히면 그게 더 낫습니다.',
      ];
    }

    return ['규칙:', '- 이 파일의 목적에 맞는 내용만 담습니다.'];
  }

  /* ── 프롬프트 조각들 ─────────────────────────── */

  private departmentMaterials({ session, agents }: PhaseContext): string[] {
    return session.team
      .filter((id) => id !== 'dev')
      .map((id) => {
        const a = agents.findById(id);
        return `\n### ${a.dept}\n${session.drafts.get(id) ?? ''}`;
      });
  }

  /** 이미 만든 파일을 다음 파일의 근거로 넣는다 */
  private writtenFilesBlock(written: ArtifactFile[]): string[] {
    if (written.length === 0) return [];

    return [
      '',
      '## 이미 확정된 파일 — 여기에 맞춰야 합니다',
      ...written.map(
        (f) => `\n### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``,
      ),
    ];
  }

  /**
   * 재작업 안내.
   *
   * 직전 결과물을 함께 보여줍니다. 그러지 않으면 소형 모델은
   * 반려 사유만 보고 완전히 다른 페이지를 새로 만들어버려서,
   * 지적받지 않은 멀쩡한 부분까지 사라집니다.
   */
  private reworkBlock(options: BuildOptions, written: ArtifactFile[]): string[] {
    if (options.attempt === 0 || !options.rejection) return [];

    /*
     * 직전 결과물은 **이번 회차의 첫 파일에만** 붙입니다.
     * 두 번째 파일부터는 방금 새로 쓴 파일이 이미 컨텍스트에 있으므로,
     * 옛 버전을 같이 보여주면 어느 쪽에 맞춰야 할지 헷갈립니다.
     */
    const previousHtml =
      written.length === 0
        ? options.previousFiles.find((f) => f.path.toLowerCase().endsWith('.html'))
        : undefined;

    return [
      '',
      '## ⚠️ 비서실장 반려 사유 — 반드시 해결할 것',
      ...options.rejection.issues.map((i) => `- ${i}`),
      options.rejection.note,
      ...(previousHtml
        ? [
            '',
            '## 직전 결과물 — 지적받은 부분만 고치고 나머지는 유지하세요',
            `\`\`\`${previousHtml.language}\n${previousHtml.content}\n\`\`\``,
          ]
        : []),
    ];
  }

  /* ── 응답에서 코드만 건져낸다 ─────────────────── */

  private fenceLanguage(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.html')) return 'html';
    if (lower.endsWith('.css')) return 'css';
    if (lower.endsWith('.js')) return 'javascript';
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.svg')) return 'svg';
    return '';
  }

  /**
   * 모델이 코드블록 밖에 잡담을 붙여도 코드만 꺼냅니다.
   *
   * 우선순위:
   *  1. 코드펜스 중 가장 긴 것 (설명용 짧은 예시 블록에 속지 않기 위해)
   *  2. HTML 이면 `<!DOCTYPE`/`<html` 부터 `</html>` 까지 직접 오려내기
   *  3. 그래도 못 찾으면 원문 그대로 (빈 파일보다는 낫습니다)
   */
  private extractCode(raw: string, filePath: string): string {
    const fences = [...raw.matchAll(/```[\w-]*\n([\s\S]*?)```/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);

    if (fences.length > 0) {
      return fences.reduce((longest, current) =>
        current.length > longest.length ? current : longest,
      );
    }

    if (filePath.toLowerCase().endsWith('.html')) {
      const start = raw.search(/<!DOCTYPE html|<html[\s>]/i);
      const end = raw.toLowerCase().lastIndexOf('</html>');
      if (start !== -1 && end > start) {
        return raw.slice(start, end + '</html>'.length);
      }
    }

    this.logger.warn(`${filePath}: 코드블록을 찾지 못해 응답을 그대로 씁니다.`);
    return raw.trim();
  }
}
