import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ArtifactFile } from '@shared';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { WorkspaceConfig } from '../config/configuration';
import { WorkspaceProjectEntity } from './entities/workspace-project.entity';

/** 만들어도 되는 파일 종류 — 이 목록에 없으면 거부합니다 */
const ALLOWED_EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ['.html', 'html'],
  ['.css', 'css'],
  ['.js', 'javascript'],
  ['.json', 'json'],
  ['.svg', 'svg'],
  ['.txt', 'text'],
  ['.md', 'markdown'],
]);

/** 한 프로젝트에서 만들 수 있는 파일 수 상한 */
export const MAX_FILES = 6;

/**
 * 코드형 산출물의 파일시스템 담당.
 *
 * 볼트와 완전히 분리돼 있습니다. 볼트는 "회사의 기억"이고
 * 여기는 "실제로 돌아가는 결과물"입니다. 섞으면 Obsidian 이
 * html/css 를 노트로 인식해 회상 결과가 오염됩니다.
 */
@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceService.name);
  private readonly config: WorkspaceConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<WorkspaceConfig>('workspace');
  }

  onModuleInit(): void {
    fs.mkdirSync(this.config.path, { recursive: true });
    this.logger.log(`워크스페이스 준비 완료: ${this.config.path}`);
  }

  get basePath(): string {
    return this.config.path;
  }

  async createProject(brief: string): Promise<WorkspaceProjectEntity> {
    const project = WorkspaceProjectEntity.create(this.config.path, brief);
    await fsp.mkdir(project.absolutePath, { recursive: true });
    return project;
  }

  /**
   * 파일 하나를 기록한다.
   *
   * LLM 이 만들어낸 경로를 그대로 믿지 않습니다. `../` 로 폴더를 빠져나가거나
   * 실행 가능한 확장자를 쓰려는 시도는 여기서 막습니다.
   */
  async writeArtifact(
    project: WorkspaceProjectEntity,
    relativePath: string,
    content: string,
  ): Promise<ArtifactFile> {
    const safePath = this.sanitizePath(relativePath);
    const absolute = project.filePath(safePath);

    // 정규화 후에도 폴더 안에 있는지 최종 확인 (심볼릭 링크·유니코드 우회 대비)
    const root = path.resolve(project.absolutePath);
    if (!path.resolve(absolute).startsWith(root + path.sep)) {
      throw new Error(`워크스페이스 밖으로 나가는 경로입니다: ${relativePath}`);
    }

    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await fsp.writeFile(absolute, content, 'utf8');

    return {
      path: safePath.replace(/\\/g, '/'),
      language: this.languageOf(safePath),
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  }

  /** 브라우저로 열 주소 — 프론트가 API 베이스를 앞에 붙여 씁니다 */
  previewUrl(project: WorkspaceProjectEntity, entry = 'index.html'): string {
    return `${this.config.urlPrefix}/${project.folderName}/${entry}`;
  }

  /**
   * LLM 이 제안한 파일 경로가 쓸 만한지 판정한다.
   * 거부 사유를 문자열로 돌려주고, 문제가 없으면 null 을 돌려줍니다.
   */
  rejectReason(relativePath: string): string | null {
    const trimmed = relativePath.trim();
    if (!trimmed) return '빈 경로';
    if (path.isAbsolute(trimmed) || /^[a-z]:/i.test(trimmed))
      return '절대경로는 허용하지 않습니다';
    if (trimmed.includes('..')) return '상위 폴더 접근은 허용하지 않습니다';
    if (trimmed.split(/[\\/]/).length > 3) return '폴더 깊이가 너무 깊습니다';

    const ext = path.extname(trimmed).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext))
      return `허용하지 않는 확장자입니다 (${ext || '없음'})`;

    return null;
  }

  private sanitizePath(relativePath: string): string {
    const reason = this.rejectReason(relativePath);
    if (reason) throw new Error(`${reason}: ${relativePath}`);
    return path.normalize(relativePath.trim()).replace(/^[\\/]+/, '');
  }

  private languageOf(filePath: string): string {
    return ALLOWED_EXTENSIONS.get(path.extname(filePath).toLowerCase()) ?? 'text';
  }
}
