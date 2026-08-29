import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { VaultConfig } from '../../config/configuration';
import { VaultNoteEntity } from '../entities/vault-note.entity';
import { VaultProjectEntity } from '../entities/vault-project.entity';

/**
 * 파일시스템 접근을 전담하는 리포지토리.
 *
 * 위 계층(VaultService)은 경로 조립이나 fs API 를 전혀 모릅니다.
 * 나중에 Obsidian Local REST API 나 S3 로 바꾸려면 이 클래스만 갈아끼우면 됩니다.
 */
@Injectable()
export class VaultRepository implements OnModuleInit {
  private readonly logger = new Logger(VaultRepository.name);
  private readonly config: VaultConfig;

  /** 절대경로 → 마지막으로 읽은 내용. `loadAllNotes` 만 만집니다. */
  private readonly noteCache = new Map<
    string,
    { mtimeMs: number; note: VaultNoteEntity }
  >();

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<VaultConfig>('vault');
  }

  onModuleInit(): void {
    fs.mkdirSync(this.projectsDir, { recursive: true });
    this.logger.log(`볼트 준비 완료: ${this.basePath}`);
  }

  /** 볼트 최상위 (사용자의 Obsidian 볼트) */
  get vaultPath(): string {
    return this.config.path;
  }

  /** 이 앱이 사용하는 하위 폴더 */
  get basePath(): string {
    return path.join(this.config.path, this.config.rootFolder);
  }

  get projectsDir(): string {
    return path.join(this.basePath, '프로젝트');
  }

  /**
   * 볼트 루트 기준 프로젝트 폴더 경로.
   * 위키링크(`[[AI Company/프로젝트/...]]`)를 만들 때 씁니다 —
   * 파일시스템 경로가 아니라 Obsidian 이 해석하는 경로입니다.
   */
  get projectsFolder(): string {
    return `${this.config.rootFolder}/프로젝트`;
  }

  get indexPath(): string {
    return path.join(this.basePath, '_인덱스.md');
  }

  /**
   * 부서가 세션을 거치며 쌓는 지식 노트.
   *
   * 프로젝트 폴더 **밖**에 둡니다. 프로젝트 노트는 한 건의 기록이지만
   * 이 노트는 부서의 누적 기억이라 수명이 다릅니다.
   */
  knowledgePath(dept: string): string {
    return path.join(this.basePath, '부서 지식', `${dept}.md`);
  }

  /* ── 쓰기 ─────────────────────────────────────── */

  async createProject(brief: string): Promise<VaultProjectEntity> {
    const project = VaultProjectEntity.create(this.projectsDir, brief);
    await fsp.mkdir(path.join(project.absolutePath, '부서'), { recursive: true });
    return project;
  }

  async write(absolutePath: string, content: string): Promise<void> {
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, content, 'utf8');
    // mtime 만으로도 대개 잡히지만, 같은 밀리초에 쓰고 읽는 경우를 위해 명시적으로 버립니다
    this.noteCache.delete(absolutePath);
  }

  async readIfExists(absolutePath: string): Promise<string | null> {
    try {
      return await fsp.readFile(absolutePath, 'utf8');
    } catch {
      return null;
    }
  }

  /* ── 읽기 ─────────────────────────────────────── */

  async listProjects(limit = 20): Promise<VaultProjectEntity[]> {
    let names: string[];
    try {
      const entries = await fsp.readdir(this.projectsDir, { withFileTypes: true });
      names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }

    return names
      .sort()
      .reverse()
      .slice(0, limit)
      .map((name) => VaultProjectEntity.fromFolderName(this.projectsDir, name));
  }

  /**
   * 볼트 안의 모든 마크다운 노트를 읽어들인다 (인덱스 파일 제외).
   *
   * 매 세션 전체 파일을 다시 읽던 것을 **mtime 캐시**로 바꿨습니다.
   * 볼트가 커질수록(프로젝트 200건이면 파일 1,000개 이상) 회상 한 번에
   * 디스크를 통째로 훑는 비용이 무시하기 어려워집니다.
   *
   * 캐시는 파일 목록은 매번 확인하고(싸다), 내용은 mtime 이 바뀐 것만
   * 다시 읽습니다. 사용자가 Obsidian 에서 노트를 고쳐도 다음 회상에 반영됩니다.
   */
  async loadAllNotes(): Promise<VaultNoteEntity[]> {
    const files = await this.walk(this.basePath);
    const notes: VaultNoteEntity[] = [];
    const seen = new Set<string>();

    for (const file of files) {
      if (path.basename(file) === '_인덱스.md') continue;
      seen.add(file);

      try {
        const stat = await fsp.stat(file);
        const cached = this.noteCache.get(file);

        if (cached && cached.mtimeMs === stat.mtimeMs) {
          notes.push(cached.note);
          continue;
        }

        const content = await fsp.readFile(file, 'utf8');
        const note = new VaultNoteEntity(
          path.relative(this.vaultPath, file).replace(/\\/g, '/'),
          path.basename(file, '.md'),
          content,
          stat.mtime,
        );

        this.noteCache.set(file, { mtimeMs: stat.mtimeMs, note });
        notes.push(note);
      } catch {
        this.logger.warn(`노트를 읽지 못했습니다: ${file}`);
        this.noteCache.delete(file);
      }
    }

    // 지워진 파일을 캐시에 남겨 두면 메모리가 계속 늘어납니다
    for (const key of this.noteCache.keys()) {
      if (!seen.has(key)) this.noteCache.delete(key);
    }

    return notes;
  }

  /** 볼트 밖으로 나가는 경로 접근을 차단하고 노트를 읽는다 */
  async readNoteByRelativePath(relativePath: string): Promise<string | null> {
    const root = path.resolve(this.vaultPath);
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep) && target !== root) return null;
    return this.readIfExists(target);
  }

  private async walk(dir: string, acc: string[] = []): Promise<string[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return acc;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await this.walk(full, acc);
      else if (entry.name.endsWith('.md')) acc.push(full);
    }
    return acc;
  }
}
